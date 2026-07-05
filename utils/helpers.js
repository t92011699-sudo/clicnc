// دالة للردود الموحدة
export function sendResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        }
    });
}

// دالة للردود الخطأ
export function sendError(message, status = 500) {
    return new Response(JSON.stringify({ error: message }), {
        status,
        headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        }
    });
}

// دالة لاستخراج الـ ID من الـ URL
export function getIdFromUrl(url) {
    const parts = url.pathname.split('/');
    return parts[parts.length - 1];
}

// دالة للتحقق من صحة بيانات الحجز
export function validateBooking(data) {
    const { patient_name, patient_age, patient_phone, time_slot_id } = data;
    if (!patient_name || patient_name.trim().length < 2) {
        return { valid: false, message: 'الاسم يجب أن يكون 2 أحرف على الأقل' };
    }
    if (!patient_age || patient_age < 1 || patient_age > 150) {
        return { valid: false, message: 'العمر يجب أن يكون بين 1 و 150' };
    }
    if (!patient_phone || patient_phone.trim().length < 10) {
        return { valid: false, message: 'رقم الهاتف يجب أن يكون 10 أرقام على الأقل' };
    }
    if (!time_slot_id) {
        return { valid: false, message: 'يجب اختيار موعد' };
    }
    return { valid: true };
}

// دالة لتوليد فترات افتراضية
export function generateDefaultSlots() {
    return [
        { start: '09:00:00', end: '10:00:00', max: 1 },
        { start: '10:00:00', end: '11:00:00', max: 1 },
        { start: '11:00:00', end: '12:00:00', max: 2 },
        { start: '16:00:00', end: '17:00:00', max: 1 },
        { start: '17:00:00', end: '18:00:00', max: 2 }
    ];
}