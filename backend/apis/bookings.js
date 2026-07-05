 import { supabase } from '../config/supabase.js';
import { sendResponse, sendError, validateBooking } from '../utils/helpers.js';

// POST /api/bookings - إنشاء حجز جديد
export async function POST(req) {
    try {
        const bookingData = await req.json();
        
        // التحقق من صحة البيانات
        const validation = validateBooking(bookingData);
        if (!validation.valid) {
            return sendError(validation.message, 400);
        }
        
        const { time_slot_id, patient_name, patient_age, patient_phone, department_name, doctor_name } = bookingData;
        
        // التحقق من وجود الفترة
        const { data: slot, error: slotError } = await supabase
            .from('time_slots')
            .select('*, doctors(name)')
            .eq('id', time_slot_id)
            .single();
            
        if (slotError || !slot) {
            return sendError('الموعد غير موجود', 404);
        }
        
        // التحقق من توفر الفترة
        if (!slot.is_available) {
            return sendError('الموعد غير متاح', 400);
        }
        
        if (slot.current_bookings >= slot.max_bookings) {
            return sendError('الموعد مكتمل', 400);
        }
        
        // بدء المعاملة (Transaction)
        // 1. إضافة الحجز
        const { data: booking, error: bookingError } = await supabase
            .from('bookings')
            .insert([{ 
                time_slot_id, 
                patient_name: patient_name.trim(), 
                patient_age, 
                patient_phone: patient_phone.trim(),
                department_name: department_name || slot.doctors?.name || '',
                doctor_name: doctor_name || ''
            }])
            .select();
            
        if (bookingError) throw bookingError;
        
        // 2. تحديث عدد الحجوزات في الفترة
        const { error: updateError } = await supabase
            .rpc('increment_booking', { slot_id: time_slot_id });
            
        if (updateError) throw updateError;
        
        return sendResponse({
            message: 'تم الحجز بنجاح',
            booking: booking[0]
        }, 201);
        
    } catch (error) {
        return sendError(error.message);
    }
}

// GET /api/bookings?phone={phone} - الحصول على حجوزات المريض
export async function GET(req) {
    try {
        const url = new URL(req.url);
        const phone = url.searchParams.get('phone');
        
        if (!phone) {
            return sendError('رقم الهاتف مطلوب', 400);
        }
        
        const { data, error } = await supabase
            .from('bookings')
            .select(`
                *,
                time_slots (
                    id,
                    date,
                    start_time,
                    end_time,
                    doctors (
                        name,
                        gender
                    )
                )
            `)
            .eq('patient_phone', phone)
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        return sendResponse(data);
    } catch (error) {
        return sendError(error.message);
    }
}

// DELETE /api/bookings/{id} - إلغاء حجز
export async function DELETE(req) {
    try {
        const id = getIdFromUrl(new URL(req.url));
        
        // الحصول على الحجز
        const { data: booking, error: getError } = await supabase
            .from('bookings')
            .select('time_slot_id')
            .eq('id', id)
            .single();
            
        if (getError || !booking) {
            return sendError('الحجز غير موجود', 404);
        }
        
        // حذف الحجز
        const { error: deleteError } = await supabase
            .from('bookings')
            .delete()
            .eq('id', id);
            
        if (deleteError) throw deleteError;
        
        // تقليل عدد الحجوزات في الفترة
        const { error: updateError } = await supabase
            .rpc('decrement_booking', { slot_id: booking.time_slot_id });
            
        if (updateError) throw updateError;
        
        return sendResponse({ message: 'تم إلغاء الحجز بنجاح' });
    } catch (error) {
        return sendError(error.message);
    }
}