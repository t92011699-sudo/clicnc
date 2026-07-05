<?php
/**
 * Save Controller
 * Handles: PUT /api/departments/{id}/save
 * Bulk save entire department with nested doctor_types, fixed_slots, custom_slots
 */
class SaveController {
    private PDO $db;

    public function __construct(PDO $db) {
        $this->db = $db;
    }

    /**
     * PUT /api/departments/{id}/save
     * Save entire department in one transaction
     */
    public function save(int $departmentId) {
        $request = new Request();
        $data = $request->all();

        $this->db->beginTransaction();

        try {
            // 1. Update department basics
            if (isset($data['name']) || array_key_exists('icon_url', $data)) {
                $fields = [];
                $values = [];

                if (isset($data['name'])) {
                    $fields[] = 'name = ?';
                    $values[] = $data['name'];
                }
                if (array_key_exists('icon_url', $data)) {
                    $fields[] = 'icon_url = ?';
                    $values[] = $data['icon_url'];
                }

                if (!empty($fields)) {
                    $values[] = $departmentId;
                    $sql = "UPDATE departments SET " . implode(', ', $fields) . ", updated_at = NOW() WHERE id = ?";
                    $stmt = $this->db->prepare($sql);
                    $stmt->execute($values);
                }
            }

            // 2. Process doctor_types with nested slots
            if (isset($data['doctor_types']) && is_array($data['doctor_types'])) {
                foreach ($data['doctor_types'] as $dtData) {
                    $this->processDoctorType($departmentId, $dtData);
                }
            }

            $this->db->commit();

            // Return updated department
            $department = $this->getDepartment($departmentId);
            Response::success([
                'success' => true,
                'department' => $department
            ]);

        } catch (Exception $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    private function processDoctorType(int $departmentId, array $dtData): void {
        if (!isset($dtData['type'])) return;

        $type = $dtData['type'];

        // Update doctor_type basics
        $stmt = $this->db->prepare("
            UPDATE doctor_types
            SET enabled = ?, label = COALESCE(?, label), updated_at = NOW()
            WHERE department_id = ? AND type = ?::doctor_gender
            RETURNING id
        ");
        $stmt->execute([
            $dtData['enabled'] ?? false,
            $dtData['label'] ?? null,
            $departmentId,
            $type
        ]);
        $doctorType = $stmt->fetch();

        if (!$doctorType) {
            throw new Exception("Doctor type {$type} not found for department {$departmentId}");
        }

        $doctorTypeId = (int)$doctorType['id'];

        // Process fixed_slots
        if (isset($dtData['fixed_slots'])) {
            $this->processFixedSlots($doctorTypeId, $dtData['fixed_slots']);
        }

        // Process custom_slots
        if (isset($dtData['custom_slots'])) {
            $this->processCustomSlots($doctorTypeId, $dtData['custom_slots']);
        }
    }

    private function processFixedSlots(int $doctorTypeId, array $slots): void {
        $existingIds = [];
        $order = 1;

        foreach ($slots as $slot) {
            if (!empty($slot['id'])) {
                // Update existing
                $stmt = $this->db->prepare("
                    UPDATE fixed_slots
                    SET capacity = ?, from_time = ?::time, to_time = ?::time, \"order\" = ?, updated_at = NOW()
                    WHERE id = ? AND doctor_type_id = ?
                    RETURNING id
                ");
                $stmt->execute([
                    $slot['capacity'] ?? 1,
                    $slot['from_time'],
                    $slot['to_time'],
                    $order++,
                    $slot['id'],
                    $doctorTypeId
                ]);
                $result = $stmt->fetch();
                if ($result) {
                    $existingIds[] = (int)$result['id'];
                }
            } else {
                // Insert new
                $stmt = $this->db->prepare("
                    INSERT INTO fixed_slots (doctor_type_id, capacity, from_time, to_time, \"order\")
                    VALUES (?, ?, ?::time, ?::time, ?)
                    RETURNING id
                ");
                $stmt->execute([
                    $doctorTypeId,
                    $slot['capacity'] ?? 1,
                    $slot['from_time'],
                    $slot['to_time'],
                    $order++
                ]);
                $existingIds[] = (int)$stmt->fetch()['id'];
            }
        }

        // Delete slots not in the list
        if (!empty($existingIds)) {
            $placeholders = implode(',', array_fill(0, count($existingIds), '?'));
            $stmt = $this->db->prepare("
                DELETE FROM fixed_slots
                WHERE doctor_type_id = ? AND id NOT IN ({$placeholders})
            ");
            $stmt->execute(array_merge([$doctorTypeId], $existingIds));
        } else {
            $stmt = $this->db->prepare("DELETE FROM fixed_slots WHERE doctor_type_id = ?");
            $stmt->execute([$doctorTypeId]);
        }
    }

    private function processCustomSlots(int $doctorTypeId, array $slots): void {
        $existingIds = [];

        foreach ($slots as $slot) {
            if (!empty($slot['id'])) {
                // Update existing
                $stmt = $this->db->prepare("
                    UPDATE custom_slots
                    SET date = ?, capacity = ?, from_time = ?::time, to_time = ?::time, updated_at = NOW()
                    WHERE id = ? AND doctor_type_id = ?
                    RETURNING id
                ");
                $stmt->execute([
                    $slot['date'],
                    $slot['capacity'] ?? 1,
                    $slot['from_time'],
                    $slot['to_time'],
                    $slot['id'],
                    $doctorTypeId
                ]);
                $result = $stmt->fetch();
                if ($result) {
                    $existingIds[] = (int)$result['id'];
                }
            } else {
                // Insert new
                $stmt = $this->db->prepare("
                    INSERT INTO custom_slots (doctor_type_id, date, capacity, from_time, to_time)
                    VALUES (?, ?, ?, ?::time, ?::time)
                    RETURNING id
                ");
                $stmt->execute([
                    $doctorTypeId,
                    $slot['date'],
                    $slot['capacity'] ?? 1,
                    $slot['from_time'],
                    $slot['to_time']
                ]);
                $existingIds[] = (int)$stmt->fetch()['id'];
            }
        }

        // Delete slots not in the list
        if (!empty($existingIds)) {
            $placeholders = implode(',', array_fill(0, count($existingIds), '?'));
            $stmt = $this->db->prepare("
                DELETE FROM custom_slots
                WHERE doctor_type_id = ? AND id NOT IN ({$placeholders})
            ");
            $stmt->execute(array_merge([$doctorTypeId], $existingIds));
        }
    }

    private function getDepartment(int $departmentId): array {
        $stmt = $this->db->prepare("
            SELECT d.*,
                   COALESCE(fs.count, 0) + COALESCE(cs.count, 0) as total_slots_count
            FROM departments d
            LEFT JOIN (
                SELECT dt.department_id, COUNT(*) as count
                FROM fixed_slots f
                JOIN doctor_types dt ON dt.id = f.doctor_type_id
                GROUP BY dt.department_id
            ) fs ON fs.department_id = d.id
            LEFT JOIN (
                SELECT dt.department_id, COUNT(*) as count
                FROM custom_slots c
                JOIN doctor_types dt ON dt.id = c.doctor_type_id
                GROUP BY dt.department_id
            ) cs ON cs.department_id = d.id
            WHERE d.id = ?
        ");
        $stmt->execute([$departmentId]);
        $department = $stmt->fetch();

        $department['total_slots_count'] = (int)$department['total_slots_count'];
        $department['doctor_types'] = $this->getDoctorTypesExpanded($departmentId);

        return $department;
    }

    private function getDoctorTypesExpanded(int $departmentId): array {
        $stmt = $this->db->prepare("
            SELECT id, type, label, enabled
            FROM doctor_types
            WHERE department_id = ?
            ORDER BY type
        ");
        $stmt->execute([$departmentId]);
        $types = $stmt->fetchAll();

        foreach ($types as &$dt) {
            $dt['fixed_slots'] = $this->getFixedSlots($dt['id']);
            $dt['custom_slots'] = $this->getCustomSlots($dt['id']);
        }

        return $types;
    }

    private function getFixedSlots(int $doctorTypeId): array {
        $stmt = $this->db->prepare("
            SELECT id, capacity, from_time, to_time, \"order\"
            FROM fixed_slots
            WHERE doctor_type_id = ?
            ORDER BY \"order\"
        ");
        $stmt->execute([$doctorTypeId]);
        return $stmt->fetchAll();
    }

    private function getCustomSlots(int $doctorTypeId): array {
        $stmt = $this->db->prepare("
            SELECT id, date, capacity, from_time, to_time
            FROM custom_slots
            WHERE doctor_type_id = ?
            ORDER BY date, from_time
        ");
        $stmt->execute([$doctorTypeId]);
        return $stmt->fetchAll();
    }
}
