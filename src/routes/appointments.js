 const express = require('express');
const router = express.Router();
const { supabase, supabaseAdmin } = require('../config/supabase');
const { authenticate } = require('../middleware/auth');

// 📅 جلب مواعيد دكتور معين
router.get('/doctor/:doctorId', async (req, res) => {
    try {
        const { doctorId } = req.params;
        const { day } = req.query;

        console.log('🔍 جلب مواعيد الدكتور:', doctorId);
        console.log('📅 اليوم:', day);

        // ✅ التحقق من صحة الـ ID
        if (!doctorId || doctorId === 'undefined' || doctorId === 'null') {
            return res.status(400).json({
                success: false,
                error: '❌ ID الدكتور غير صحيح'
            });
        }

        // ✅ جلب المواعيد
        let query = supabase
            .from('appointments')
            .select(`
                *,
                bookings:bookings(count)
            `)
            .eq('doctor_id', doctorId);

        if (day) {
            query = query.eq('day_of_week', day);
        }

        const { data, error } = await query;

        if (error) {
            console.error('❌ خطأ في قاعدة البيانات:', error);
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }

        console.log('✅ عدد المواعيد:', data?.length || 0);

        // حساب المواعيد المتاحة
        const appointments = data.map(app => ({
            ...app,
            booked_count: app.bookings[0]?.count || 0,
            available_slots: app.max_bookings - (app.bookings[0]?.count || 0),
            is_available: (app.max_bookings - (app.bookings[0]?.count || 0)) > 0
        }));

        res.json({
            success: true,
            appointments
        });
    } catch (error) {
        console.error('❌ خطأ في جلب المواعيد:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 📅 إضافة موعد (للدكتور فقط)
router.post('/', authenticate, async (req, res) => {
    try {
        const { day_of_week, time, max_bookings = 3 } = req.body;

        if (!day_of_week || !time) {
            return res.status(400).json({ error: '❌ اليوم والوقت مطلوبين' });
        }

        console.log('📝 إضافة موعد:');
        console.log('   الدكتور:', req.user.id);
        console.log('   اليوم:', day_of_week);
        console.log('   الوقت:', time);
        console.log('   السعة:', max_bookings);

        // التحقق من عدم وجود موعد مكرر
        const { data: existing, error: checkError } = await supabase
            .from('appointments')
            .select('id')
            .eq('doctor_id', req.user.id)
            .eq('day_of_week', day_of_week)
            .eq('time', time)
            .single();

        if (existing) {
            return res.status(400).json({ error: '❌ هذا الموعد موجود بالفعل' });
        }

        // إضافة الموعد
        const { data, error } = await supabaseAdmin
            .from('appointments')
            .insert({
                doctor_id: req.user.id,
                day_of_week,
                time,
                max_bookings
            })
            .select()
            .single();

        if (error) {
            console.error('❌ خطأ في الإضافة:', error);
            return res.status(500).json({ error: error.message });
        }

        console.log('✅ تم إضافة الموعد:', data.id);

        res.status(201).json({
            success: true,
            message: '✅ تم إضافة الموعد بنجاح',
            appointment: data
        });
    } catch (error) {
        console.error('❌ خطأ في إضافة الموعد:', error);
        res.status(500).json({ error: error.message });
    }
});

// 📅 حذف موعد (للدكتور فقط)
router.delete('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;

        console.log('🗑️ حذف موعد:', id);
        console.log('   الدكتور:', req.user.id);

        // التحقق من وجود الموعد وأنه يخص الدكتور
        const { data: appointment, error: checkError } = await supabase
            .from('appointments')
            .select('id')
            .eq('id', id)
            .eq('doctor_id', req.user.id)
            .single();

        if (!appointment) {
            return res.status(404).json({ error: '❌ الموعد غير موجود أو لا يخصك' });
        }

        // حذف الموعد
        const { error } = await supabaseAdmin
            .from('appointments')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('❌ خطأ في الحذف:', error);
            return res.status(500).json({ error: error.message });
        }

        console.log('✅ تم حذف الموعد');

        res.json({
            success: true,
            message: '✅ تم حذف الموعد بنجاح'
        });
    } catch (error) {
        console.error('❌ خطأ في حذف الموعد:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;