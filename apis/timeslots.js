 import { supabase } from '../config/supabase.js';
import { sendResponse, sendError, getIdFromUrl, generateDefaultSlots } from '../utils/helpers.js';

// GET /api/timeslots - الحصول على الفترات حسب الطبيب والتاريخ
export async function GET(req) {
    try {
        const url = new URL(req.url);
        const doctorId = url.searchParams.get('doctorId');
        const date = url.searchParams.get('date');
        const month = url.searchParams.get('month');
        const year = url.searchParams.get('year');
        
        let query = supabase.from('time_slots').select('*');
        
        if (doctorId) {
            query = query.eq('doctor_id', doctorId);
        }
        
        if (date) {
            query = query.eq('date', date);
        }
        
        if (month && year) {
            const startDate = `${year}-${month.padStart(2, '0')}-01`;
            const endDate = `${year}-${month.padStart(2, '0')}-31`;
            query = query.gte('date', startDate).lte('date', endDate);
        }
        
        const { data, error } = await query.order('date').order('start_time');
            
        if (error) throw error;
        
        // إذا كان الطلب ليوم محدد ولا توجد فترات، نضيف فترات افتراضية
        if (date && doctorId && (!data || data.length === 0)) {
            const defaultSlots = generateDefaultSlots();
            const slotsToInsert = defaultSlots.map(slot => ({
                doctor_id: doctorId,
                date: date,
                start_time: slot.start,
                end_time: slot.end,
                max_bookings: slot.max,
                current_bookings: 0,
                is_available: true
            }));
            
            const { data: newSlots, error: insertError } = await supabase
                .from('time_slots')
                .insert(slotsToInsert)
                .select();
                
            if (!insertError) {
                return sendResponse({
                    slots: newSlots,
                    message: 'تم إضافة فترات افتراضية لهذا اليوم'
                });
            }
        }
        
        return sendResponse(data);
    } catch (error) {
        return sendError(error.message);
    }
}

// POST /api/timeslots - إضافة فترة زمنية
export async function POST(req) {
    try {
        const { doctor_id, date, start_time, end_time, max_bookings } = await req.json();
        
        if (!doctor_id) return sendError('معرف الطبيب مطلوب', 400);
        if (!date) return sendError('التاريخ مطلوب', 400);
        if (!start_time) return sendError('وقت البداية مطلوب', 400);
        if (!end_time) return sendError('وقت النهاية مطلوب', 400);
        
        // التحقق من وجود الطبيب
        const { data: doc, error: docError } = await supabase
            .from('doctors')
            .select('id')
            .eq('id', doctor_id)
            .single();
            
        if (docError || !doc) {
            return sendError('الطبيب غير موجود', 404);
        }
        
        // التحقق من عدم وجود تعارض
        const { data: existing, error: existError } = await supabase
            .from('time_slots')
            .select('*')
            .eq('doctor_id', doctor_id)
            .eq('date', date)
            .eq('start_time', start_time);
            
        if (existError) throw existError;
        
        if (existing && existing.length > 0) {
            return sendError('يوجد موعد مكرر في هذا الوقت', 400);
        }
        
        const { data, error } = await supabase
            .from('time_slots')
            .insert([{ 
                doctor_id, 
                date, 
                start_time, 
                end_time, 
                max_bookings: max_bookings || 1,
                current_bookings: 0,
                is_available: true
            }])
            .select();
            
        if (error) throw error;
        return sendResponse({
            slot: data[0],
            message: 'تم إضافة الفترة بنجاح'
        }, 201);
    } catch (error) {
        return sendError(error.message);
    }
}

// PUT /api/timeslots/{id} - تعديل فترة زمنية
export async function PUT(req) {
    try {
        const id = getIdFromUrl(new URL(req.url));
        const { start_time, end_time, max_bookings } = await req.json();
        
        const updates = {
            updated_at: new Date()
        };
        
        if (start_time) updates.start_time = start_time;
        if (end_time) updates.end_time = end_time;
        if (max_bookings) updates.max_bookings = max_bookings;
        
        // التحقق من وجود حجوزات
        const { data: slot, error: slotError } = await supabase
            .from('time_slots')
            .select('current_bookings')
            .eq('id', id)
            .single();
            
        if (slotError) throw slotError;
        
        if (slot.current_bookings > 0) {
            return sendError('لا يمكن تعديل الفترة لأن بها حجوزات', 400);
        }
        
        const { data, error } = await supabase
            .from('time_slots')
            .update(updates)
            .eq('id', id)
            .select();
            
        if (error) throw error;
        if (!data || data.length === 0) {
            return sendError('الفترة غير موجودة', 404);
        }
        return sendResponse({
            slot: data[0],
            message: 'تم تعديل الفترة بنجاح'
        });
    } catch (error) {
        return sendError(error.message);
    }
}

// DELETE /api/timeslots/{id} - حذف فترة زمنية
export async function DELETE(req) {
    try {
        const id = getIdFromUrl(new URL(req.url));
        
        // التحقق من وجود حجوزات
        const { count, error: countError } = await supabase
            .from('bookings')
            .select('*', { count: 'exact', head: true })
            .eq('time_slot_id', id);
            
        if (countError) throw countError;
        
        if (count > 0) {
            return sendError('لا يمكن حذف الفترة لأن بها حجوزات', 400);
        }
        
        const { error } = await supabase
            .from('time_slots')
            .delete()
            .eq('id', id);
            
        if (error) throw error;
        return sendResponse({ message: 'تم حذف الفترة بنجاح' });
    } catch (error) {
        return sendError(error.message);
    }
}

// POST /api/timeslots/default - إضافة فترات افتراضية لتاريخ محدد
export async function POST_default(req) {
    try {
        const { doctor_id, date } = await req.json();
        
        if (!doctor_id) return sendError('معرف الطبيب مطلوب', 400);
        if (!date) return sendError('التاريخ مطلوب', 400);
        
        // التحقق من وجود الطبيب
        const { data: doc, error: docError } = await supabase
            .from('doctors')
            .select('id')
            .eq('id', doctor_id)
            .single();
            
        if (docError || !doc) {
            return sendError('الطبيب غير موجود', 404);
        }
        
        const defaultSlots = generateDefaultSlots();
        const slotsToInsert = [];
        const errors = [];
        
        for (const slot of defaultSlots) {
            // التحقق من عدم وجود تعارض
            const { data: existing } = await supabase
                .from('time_slots')
                .select('id')
                .eq('doctor_id', doctor_id)
                .eq('date', date)
                .eq('start_time', slot.start);
                
            if (!existing || existing.length === 0) {
                slotsToInsert.push({
                    doctor_id,
                    date,
                    start_time: slot.start,
                    end_time: slot.end,
                    max_bookings: slot.max,
                    current_bookings: 0,
                    is_available: true
                });
            } else {
                errors.push(`الفترة ${slot.start} موجودة بالفعل`);
            }
        }
        
        if (slotsToInsert.length === 0) {
            return sendError('جميع الفترات موجودة بالفعل', 400);
        }
        
        const { data, error } = await supabase
            .from('time_slots')
            .insert(slotsToInsert)
            .select();
            
        if (error) throw error;
        
        return sendResponse({
            message: `تم إضافة ${data.length} فترات جديدة`,
            added: data,
            errors: errors
        }, 201);
    } catch (error) {
        return sendError(error.message);
    }
}

// GET /api/timeslots/calendar - الحصول على أيام الشهر مع حالة الفترات
export async function GET_calendar(req) {
    try {
        const url = new URL(req.url);
        const doctorId = url.searchParams.get('doctorId');
        const month = url.searchParams.get('month');
        const year = url.searchParams.get('year');
        
        if (!doctorId) return sendError('معرف الطبيب مطلوب', 400);
        if (!month) return sendError('الشهر مطلوب', 400);
        if (!year) return sendError('السنة مطلوبة', 400);
        
        const startDate = `${year}-${month.padStart(2, '0')}-01`;
        const endDate = `${year}-${month.padStart(2, '0')}-31`;
        
        // جلب كل الفترات للطبيب في هذا الشهر
        const { data, error } = await supabase
            .from('time_slots')
            .select('*')
            .eq('doctor_id', doctorId)
            .gte('date', startDate)
            .lte('date', endDate)
            .order('date')
            .order('start_time');
            
        if (error) throw error;
        
        // تجميع الفترات حسب اليوم
        const calendar = {};
        data.forEach(slot => {
            if (!calendar[slot.date]) {
                calendar[slot.date] = [];
            }
            calendar[slot.date].push(slot);
        });
        
        // معرفة الأيام التي ليس بها فترات
        const daysInMonth = new Date(year, month, 0).getDate();
        const allDays = {};
        for (let i = 1; i <= daysInMonth; i++) {
            const dateStr = `${year}-${month.padStart(2, '0')}-${i.toString().padStart(2, '0')}`;
            allDays[dateStr] = {
                has_slots: !!calendar[dateStr],
                slots_count: calendar[dateStr]?.length || 0,
                slots: calendar[dateStr] || []
            };
        }
        
        return sendResponse({
            year,
            month,
            days: allDays,
            total_slots: data.length
        });
    } catch (error) {
        return sendError(error.message);
    }
}