<?php
/**
 * Custom Slot Controller
 * Handles: CRUD for custom slots per doctor_type per date
 */
class CustomSlotController {
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
     * GET /api/departments/{dept_id}/doctor-types/{type}/custom-slots?date=YYYY-MM-DD
     */
    public function index(int $departmentId, string $type) {
        $request = new Request();
        $date = $request->query('date');

        if (empty($date)) {
            Response::validationError('date query parameter is required', 'date');
        }

        $doctorTypeId = $this->getDoctorTypeId($departmentId, $type);
        if (!$doctorTypeId) {
            Response::notFound('Doctor type');
        }

        $stmt = $this->db->prepare("
            SELECT id, date, capacity, from_time, to_time
            FROM custom_slots
            WHERE doctor_type_id = ? AND date = ?
            ORDER BY from_time
        ");
        $stmt->execute([$doctorTypeId, $date]);
        $slots = $stmt->fetchAll();

        Response::success([
            'doctor_type' => $type,
            'date' => $date,
            'custom_slots' => $slots
        ]);
    }

    /**
     * POST /api/departments/{dept_id}/doctor-types/{type}/custom-slots
     */
    public function store(int $departmentId, string $type) {
        $request = new Request();
        $data = $request->all();

        // Validation
        if (empty($data['date'])) {
            Response::validationError('date is required', 'date');
        }
        if (empty($data['from_time'])) {
            Response::validationError('from_time is required', 'from_time');
        }
        if (empty($data['to_time'])) {
            Response::validationError('to_time is required', 'to_time');
        }
        if ($data['from_time'] >= $data['to_time']) {
            Response::validationError('وقت البداية لازم يكون أقل من وقت النهاية', 'to_time');
        }

        $doctorTypeId = $this->getDoctorTypeId($departmentId, $type);
        if (!$doctorTypeId) {
            Response::notFound('Doctor type');
        }

        $stmt = $this->db->prepare("
            INSERT INTO custom_slots (doctor_type_id, date, capacity, from_time, to_time)
            VALUES (?, ?, ?, ?::time, ?::time)
            RETURNING id, doctor_type_id, date, capacity, from_time, to_time, created_at
        ");
        $stmt->execute([
            $doctorTypeId,
            $data['date'],
            $data['capacity'] ?? 1,
            $data['from_time'],
            $data['to_time']
        ]);

        $slot = $stmt->fetch();
        $slot['doctor_type'] = $type;

        Response::success($slot, 'Custom slot created', 201);
    }

    /**
     * PUT /api/departments/{dept_id}/doctor-types/{type}/custom-slots/{slot_id}
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
            SELECT id FROM custom_slots WHERE id = ? AND doctor_type_id = ?
        ");
        $stmt->execute([$slotId, $doctorTypeId]);
        if (!$stmt->fetch()) {
            Response::notFound('Custom slot');
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
        $sql = "UPDATE custom_slots SET " . implode(', ', $fields) . ", updated_at = NOW() WHERE id = ? RETURNING *";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($values);
        $slot = $stmt->fetch();

        Response::success($slot);
    }

    /**
     * DELETE /api/departments/{dept_id}/doctor-types/{type}/custom-slots/{slot_id}
     */
    public function destroy(int $departmentId, string $type, int $slotId) {
        $doctorTypeId = $this->getDoctorTypeId($departmentId, $type);
        if (!$doctorTypeId) {
            Response::notFound('Doctor type');
        }

        $stmt = $this->db->prepare("
            DELETE FROM custom_slots WHERE id = ? AND doctor_type_id = ? RETURNING id
        ");
        $stmt->execute([$slotId, $doctorTypeId]);
        $result = $stmt->fetch();

        if (!$result) {
            Response::notFound('Custom slot');
        }

        Response::success(['success' => true, 'deleted_id' => $slotId]);
    }
}
