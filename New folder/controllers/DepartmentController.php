<?php
/**
 * Department Controller
 * Handles: CRUD + Reorder for departments
 */
class DepartmentController {
    private PDO $db;

    public function __construct(PDO $db) {
        $this->db = $db;
    }

    /**
     * GET /api/departments
     * List all departments with doctor_types and total_slots_count
     */
    public function index() {
        $stmt = $this->db->query("
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
            ORDER BY d.\"order\", d.id
        ");
        $departments = $stmt->fetchAll();

        // Attach doctor_types to each department
        foreach ($departments as &$dept) {
            $dept['doctor_types'] = $this->getDoctorTypes($dept['id']);
            $dept['total_slots_count'] = (int)$dept['total_slots_count'];
        }

        Response::success([
            'departments' => $departments,
            'total' => count($departments)
        ]);
    }

    /**
     * GET /api/departments/{id}
     * Get single department with expanded doctor_types (fixed_slots + custom_slots)
     */
    public function show(int $id) {
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
        $stmt->execute([$id]);
        $department = $stmt->fetch();

        if (!$department) {
            Response::notFound('Department');
        }

        $department['total_slots_count'] = (int)$department['total_slots_count'];
        $department['doctor_types'] = $this->getDoctorTypesExpanded($id);

        Response::success($department);
    }

    /**
     * POST /api/departments
     * Create new department with default doctor_types
     */
    public function store() {
        $request = new Request();
        $data = $request->all();

        // Validation
        if (empty($data['name'])) {
            Response::validationError('Department name is required', 'name');
        }

        $this->db->beginTransaction();

        try {
            // Insert department
            $stmt = $this->db->prepare("
                INSERT INTO departments (name, icon_url, \"order\")
                VALUES (?, ?, (SELECT COALESCE(MAX(\"order\"), 0) + 1 FROM departments))
                RETURNING *
            ");
            $stmt->execute([
                $data['name'],
                $data['icon_url'] ?? null
            ]);
            $department = $stmt->fetch();

            // Create default doctor_types (male + female)
            $doctorTypes = $data['doctor_types'] ?? [
                ['type' => 'male', 'label' => 'دكتور', 'enabled' => true],
                ['type' => 'female', 'label' => 'دكتورة', 'enabled' => false]
            ];

            foreach ($doctorTypes as $dt) {
                $stmt = $this->db->prepare("
                    INSERT INTO doctor_types (department_id, type, label, enabled)
                    VALUES (?, ?::doctor_gender, ?, ?)
                ");
                $stmt->execute([
                    $department['id'],
                    $dt['type'],
                    $dt['label'] ?? ($dt['type'] === 'male' ? 'دكتور' : 'دكتورة'),
                    $dt['enabled'] ?? false
                ]);
            }

            $this->db->commit();

            $department['total_slots_count'] = 0;
            $department['doctor_types'] = $this->getDoctorTypes($department['id']);

            Response::success($department, 'Department created', 201);

        } catch (Exception $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    /**
     * PUT /api/departments/{id}
     * Update department name/icon
     */
    public function update(int $id) {
        $request = new Request();
        $data = $request->all();

        // Check exists
        $stmt = $this->db->prepare("SELECT id FROM departments WHERE id = ?");
        $stmt->execute([$id]);
        if (!$stmt->fetch()) {
            Response::notFound('Department');
        }

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

        if (empty($fields)) {
            Response::error('No fields to update', 400);
        }

        $values[] = $id;
        $sql = "UPDATE departments SET " . implode(', ', $fields) . ", updated_at = NOW() WHERE id = ? RETURNING *";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($values);
        $department = $stmt->fetch();

        Response::success($department);
    }

    /**
     * DELETE /api/departments/{id}
     */
    public function destroy(int $id) {
        $stmt = $this->db->prepare("DELETE FROM departments WHERE id = ? RETURNING id");
        $stmt->execute([$id]);
        $result = $stmt->fetch();

        if (!$result) {
            Response::notFound('Department');
        }

        Response::success(['success' => true, 'deleted_id' => $id]);
    }

    /**
     * PATCH /api/departments/reorder
     */
    public function reorder() {
        $request = new Request();
        $orderedIds = $request->get('ordered_ids');

        if (!is_array($orderedIds) || empty($orderedIds)) {
            Response::validationError('ordered_ids array is required', 'ordered_ids');
        }

        $this->db->beginTransaction();
        try {
            foreach ($orderedIds as $index => $id) {
                $stmt = $this->db->prepare('UPDATE departments SET "order" = ? WHERE id = ?');
                $stmt->execute([$index + 1, $id]);
            }
            $this->db->commit();
            Response::success(['success' => true]);
        } catch (Exception $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    // ========== Helpers ==========

    private function getDoctorTypes(int $departmentId): array {
        $stmt = $this->db->prepare("
            SELECT type, label, enabled
            FROM doctor_types
            WHERE department_id = ?
            ORDER BY type
        ");
        $stmt->execute([$departmentId]);
        return $stmt->fetchAll();
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
            $dt['custom_slots'] = []; // Could be populated if needed
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
}
