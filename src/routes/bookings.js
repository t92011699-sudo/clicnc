 const express = require('express');
const router = express.Router();
const { supabase, supabaseAdmin } = require('../config/supabase');
const { authenticate } = require('../middleware/auth');

// 📝 حجز موعد
router.post('/', async (req, res) => {
    try {
        const { time_slot_id, booking_date, patient_name, patient_phone, patient_age, department_id } = req.body;

        console.log('📝 محاولة حجز:');
        console.log('   time_slot_id:', time_slot_id);
        console.log('   booking_date:', booking_date);
        console.log('   patient_name:', patient_name);
        console.log('   patient_phone:', patient_phone);

        // ✅ التحقق من البيانات
        if (!time_slot_id) {
            return res.status(400).json({ error: '❌ time_slot_id مطلوب' });
        }

        if (!booking_date) {
            return res.status(400).json({ error: '❌ booking_date مطلوب' });
        }

        if (!patient_name) {
            return res.status(400).json({ error: '❌ الاسم مطلوب' });
        }

        if (!patient_phone) {
            return res.status(400).json({ error: '❌ رقم التلفون مطلوب' });
        }

        if (!patient_age) {
            return res.status(400).json({ error: '❌ السن مطلوب' });
        }

        // ✅ التحقق من وجود الفترة
        const { data: timeSlot, error: slotError } = await supabase
            .from('time_slots')
            .select(`
                *,
                bookings:bookings(count)
            `)
            .eq('id', time_slot_id)
            .single();

        if (slotError || !timeSlot) {
            console.error('❌ الفترة غير موجودة:', slotError);
            return res.status(404).json({ error: '❌ الفترة غير موجودة' });
        }

        console.log('✅ الفترة موجودة:');
        console.log('   max_bookings:', timeSlot.max_bookings);
        console.log('   bookings count:', timeSlot.bookings[0]?.count || 0);

        // ✅ التحقق من التوفر
        const bookedCount = timeSlot.bookings[0]?.count || 0;
        if (bookedCount >= timeSlot.max_bookings) {
            return res.status(400).json({ 
                error: `❌ الفترة مكتملة (الحد الأقصى ${timeSlot.max_bookings} مرضى)` 
            });
        }

        // ✅ التحقق من عدم وجود حجز مكرر لنفس المريض
        const { data: existingBooking } = await supabase
            .from('bookings')
            .select('id')
            .eq('time_slot_id', time_slot_id)
            .eq('booking_date', booking_date)
            .eq('patient_phone', patient_phone)
            .single();

        if (existingBooking) {
            return res.status(400).json({ error: '❌ لديك حجز بالفعل في هذا الموعد' });
        }

        // ✅ إنشاء الحجز
        const { data: booking, error } = await supabaseAdmin
            .from('bookings')
            .insert({
                time_slot_id,
                booking_date,
                patient_name,
                patient_phone,
                patient_age: parseInt(patient_age),
                department_id: department_id || null,
                status: 'confirmed'
            })
            .select(`
                *,
                time_slot:time_slots(
                    start_time,
                    end_time,
                    day_of_week,
                    max_bookings,
                    doctor:doctors(name, title)
                )
            `)
            .single();

        if (error) {
            console.error('❌ خطأ في الحجز:', error);
            return res.status(400).json({ error: error.message });
        }

        console.log('✅ تم الحجز بنجاح:', booking.id);

        res.status(201).json({
            success: true,
            message: `✅ تم الحجز بنجاح! (${bookedCount + 1}/${timeSlot.max_bookings})`,
            booking
        });
    } catch (error) {
        console.error('❌ خطأ في الحجز:', error);
        res.status(500).json({ error: error.message });
    }
});

// 📝 جلب كل الحجوزات (للسوبر أدمن)
router.get('/', authenticate, async (req, res) => {
    try {
        const { date, dept_id, doctor_id, search, status } = req.query;

        let query = supabaseAdmin
            .from('bookings')
            .select(`
                *,
                time_slot:time_slots(
                    start_time,
                    end_time,
                    day_of_week,
                    max_bookings,
                    doctor:doctors(id, name, title)
                ),
                department:departments(id, name)
            `);

        // ✅ فلترة بالتاريخ
        if (date) {
            query = query.eq('booking_date', date);
        }

        // ✅ فلترة بالقسم
        if (dept_id) {
            query = query.eq('department_id', dept_id);
        }

        // ✅ فلترة بالدكتور
        if (doctor_id) {
            query = query.eq('time_slot.doctor_id', doctor_id);
        }

        // ✅ فلترة بالحالة
        if (status) {
            query = query.eq('status', status);
        }

        // ✅ بحث بالاسم
        if (search) {
            query = query.ilike('patient_name', `%${search}%`);
        }

        const { data, error } = await query.order('booking_date', { ascending: false });

        if (error) throw error;

        res.json({
            success: true,
            bookings: data || []
        });
    } catch (error) {
        console.error('❌ خطأ في جلب الحجوزات:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// 📝 تعديل حجز (للسوبر أدمن)
router.put('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const { patient_name, patient_phone, patient_age, status } = req.body;

        const updateData = {};
        if (patient_name) updateData.patient_name = patient_name;
        if (patient_phone) updateData.patient_phone = patient_phone;
        if (patient_age) updateData.patient_age = parseInt(patient_age);
        if (status) updateData.status = status;

        const { data, error } = await supabaseAdmin
            .from('bookings')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            message: '✅ تم تعديل الحجز بنجاح',
            booking: data
        });
    } catch (error) {
        console.error('❌ خطأ في تعديل الحجز:', error);
        res.status(500).json({ error: error.message });
    }
});

// 📝 حذف حجز (للسوبر أدمن)
router.delete('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;

        await supabaseAdmin
            .from('bookings')
            .delete()
            .eq('id', id);

        res.json({
            success: true,
            message: '✅ تم حذف الحجز بنجاح'
        });
    } catch (error) {
        console.error('❌ خطأ في حذف الحجز:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;