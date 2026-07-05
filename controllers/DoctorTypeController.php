<?php
/**
 * Doctor Type Controller
 * Handles: Enable/Disable doctor types per department
 */
class DoctorTypeController {
    private PDO $db;

    public function __construct(PDO $db) {
        $this->db = $db;
    }

    /**
     * PUT /api/departments/{id}/doctor-types
     * Update enabled status for doctor types
     */
    public function update(int $departmentId) {
        $request = new Request();
        $data = $request->all();

        if (!isset($data['doctor_types']) || !is_array($data['doctor_types'])) {
            Response::validationError('doctor_types array is required', 'doctor_types');
        }

        $this->db->beginTransaction();
        try {
            $updated = [];

            foreach ($data['doctor_types'] as $dt) {
                if (!isset($dt['type'])) continue;

                $stmt = $this->db->prepare("
                    UPDATE doctor_types
                    SET enabled = ?, label = COALESCE(?, label), updated_at = NOW()
                    WHERE department_id = ? AND type = ?::doctor_gender
                    RETURNING type, label, enabled
                ");
                $stmt->execute([
                    $dt['enabled'] ?? false,
                    $dt['label'] ?? null,
                    $departmentId,
                    $dt['type']
                ]);
                $result = $stmt->fetch();
                if ($result) {
                    $updated[] = $result;
                }
            }

            $this->db->commit();

            Response::success([
                'department_id' => $departmentId,
                'doctor_types' => $updated
            ]);

        } catch (Exception $e) {
            $this->db->rollBack();
            throw $e;
        }
    }
}
