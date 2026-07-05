<?php
/**
 * Fixed Slot Controller
 * Handles: CRUD + Reorder for fixed slots per doctor_type
 */
class FixedSlotController {
    private PDO $db;

    public function __construct(PDO $db) {
        $this->db = $db;
    }

    private function getDoctorTypeId(int $departmentId, string $type): ?int {
        $stmt = $this->db->prepare("
            SELECT id FROM doctor_types
            WHERE department_id = ? AND type = ?::doctor_gender
        ");
        $stmt->execute([$departmentId, $type]);
        $result = $stmt->fetch();
        return $result ? (int)$result['id'] : null;
    }

    /**
     * GET /api/departments/{dept_id}/doctor-types/{type}/fixed-slots
     */
    public function index(int $departmentId, string $type) {
        $doctorTypeId = $this->getDoctorTypeId($departmentId, $type);
        if (!$doctorTypeId) {
            Response::notFound('Doctor type');
        }

        $stmt = $this->db->prepare("
            SELECT id, capacity, from_time, to_time, \"order\"
            FROM fixed_slots
            WHERE doctor_type_id = ?
            ORDER BY \"order\"
        ");
        $stmt->execute([$doctorTypeId]);
        $slots = $stmt->fetchAll();

        Response::success([
            'doctor_type' => $type,
            'fixed_slots' => $slots
        ]);
    }

    /**
     * POST /api/departments/{dept_id}/doctor-types/{type}/fixed-slots
     */
    public function store(int $departmentId, string $type) {
        $request = new Request();
        $data = $request->all();

        // Validation
        $errors = $this->validateSlot($data);
        if (!empty($errors)) {
            Response::validationError($errors[0]['message'], $errors[0]['field']);
        }

        $doctorTypeId = $this->getDoctorTypeId($departmentId, $type);
        if (!$doctorTypeId) {
            Response::notFound('Doctor type');
        }

        // Get next order
        $stmt = $this->db->prepare("
            SELECT COALESCE(MAX(\"order\"), 0) + 1 as next_order
            FROM fixed_slots WHERE doctor_type_id = ?
        ");
        $stmt->execute([$doctorTypeId]);
        $nextOrder = $stmt->fetch()['next_order'];

        $stmt = $this->db->prepare("
            INSERT INTO fixed_slots (doctor_type_id, capacity, from_time, to_time, \"order\")
            VALUES (?, ?, ?::time, ?::time, ?)
            RETURNING id, doctor_type_id, capacity, from_time, to_time, \"order\", created_at
        ");
        $stmt->execute([
            $doctorTypeId,
            $data['capacity'] ?? 1,
            $data['from_time'],
            $data['to_time'],
            $nextOrder
        ]);

        $slot = $stmt->fetch();
        $slot['doctor_type'] = $type;

        Response::success($slot, 'Fixed slot created', 201);
    }

    /**
     * PUT /api/departments/{dept_id}/doctor-types/{type}/fixed-slots/{slot_id}
     */
    public function update(int $departmentId, string $type, int $slotId) {
        $request = new Request();
        $data = $request->all();

        $doctorTypeId = $this->getDoctorTypeId($departmentId, $type);
        if (!$doctorTypeId) {
            Response::notFound('Doctor type');
        }

        // Verify slot belongs to this doctor_type
        $stmt = $this->db->prepare("
            SELECT id FROM fixed_slots WHERE id = ? AND doctor_type_id = ?
        ");
        $stmt->execute([$slotId, $doctorTypeId]);
        if (!$stmt->fetch()) {
            Response::notFound('Fixed slot');
        }

        $fields = [];
        $values = [];

        if (isset($data['capacity'])) {
            $fields[] = 'capacity = ?';
            $values[] = $data['capacity'];
        }
        if (isset($data['from_time'])) {
            $fields[] = 'from_time = ?::time';
            $values[] = $data['from_time'];
        }
        if (isset($data['to_time'])) {
            $fields[] = 'to_time = ?::time';
            $values[] = $data['to_time'];
        }

        if (empty($fields)) {
            Response::error('No fields to update', 400);
        }

        // Validate time range if both provided
        if (isset($data['from_time']) && isset($data['to_time'])) {
            if ($data['from_time'] >= $data['to_time']) {
                Response::validationError('وقت البداية لازم يكون أقل من وقت النهاية', 'to_time');
            }
        }

        $values[] = $slotId;
        $sql = "UPDATE fixed_slots SET " . implode(', ', $fields) . ", updated_at = NOW() WHERE id = ? RETURNING *";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($values);
        $slot = $stmt->fetch();

        Response::success($slot);
    }

    /**
     * DELETE /api/departments/{dept_id}/doctor-types/{type}/fixed-slots/{slot_id}
     */
    public function destroy(int $departmentId, string $type, int $slotId) {
        $doctorTypeId = $this->getDoctorTypeId($departmentId, $type);
        if (!$doctorTypeId) {
            Response::notFound('Doctor type');
        }

        $stmt = $this->db->prepare("
            DELETE FROM fixed_slots WHERE id = ? AND doctor_type_id = ? RETURNING id
        ");
        $stmt->execute([$slotId, $doctorTypeId]);
        $result = $stmt->fetch();

        if (!$result) {
            Response::notFound('Fixed slot');
        }

        Response::success(['success' => true, 'deleted_id' => $slotId]);
    }

    /**
     * PATCH /api/departments/{dept_id}/doctor-types/{type}/fixed-slots/reorder
     */
    public function reorder(int $departmentId, string $type) {
        $request = new Request();
        $orderedIds = $request->get('ordered_ids');

        if (!is_array($orderedIds) || empty($orderedIds)) {
            Response::validationError('ordered_ids array is required', 'ordered_ids');
        }

        $doctorTypeId = $this->getDoctorTypeId($departmentId, $type);
        if (!$doctorTypeId) {
            Response::notFound('Doctor type');
        }

        $this->db->beginTransaction();
        try {
            foreach ($orderedIds as $index => $id) {
                $stmt = $this->db->prepare("
                    UPDATE fixed_slots SET \"order\" = ? WHERE id = ? AND doctor_type_id = ?
                ");
                $stmt->execute([$index + 1, $id, $doctorTypeId]);
            }
            $this->db->commit();
            Response::success(['success' => true]);
        } catch (Exception $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    private function validateSlot(array $data): array {
        $errors = [];

        if (empty($data['from_time'])) {
            $errors[] = ['field' => 'from_time', 'message' => 'from_time is required'];
        }
        if (empty($data['to_time'])) {
            $errors[] = ['field' => 'to_time', 'message' => 'to_time is required'];
        }
        if (isset($data['from_time']) && isset($data['to_time']) && $data['from_time'] >= $data['to_time']) {
            $errors[] = ['field' => 'to_time', 'message' => 'وقت البداية لازم يكون أقل من وقت النهاية'];
        }
        if (isset($data['capacity']) && $data['capacity'] <= 0) {
            $errors[] = ['field' => 'capacity', 'message' => 'capacity must be greater than 0'];
        }

        return $errors;
    }
}
