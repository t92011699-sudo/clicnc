 const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

// 📂 جلب كل الأقسام
router.get('/', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('departments')
            .select(`
                *,
                doctors:doctors(count)
            `)
            .order('name');

        if (error) throw error;

        const departments = data.map(dept => ({
            ...dept,
            doctors_count: dept.doctors[0]?.count || 0
        }));

        res.json({
            success: true,
            departments
        });
    } catch (error) {
        console.error('Get departments error:', error);
        res.status(500).json({ error: '❌ حدث خطأ في السيرفر' });
    }
});

// 📂 جلب دكاترة قسم معين
router.get('/:departmentId/doctors', async (req, res) => {
    try {
        const { departmentId } = req.params;

        const { data, error } = await supabase
            .from('doctors')
            .select('id, name, title, gender, is_active')
            .eq('department_id', departmentId)
            .eq('is_active', true)
            .order('name');

        if (error) throw error;

        res.json({
            success: true,
            doctors: data
        });
    } catch (error) {
        console.error('Get department doctors error:', error);
        res.status(500).json({ error: '❌ حدث خطأ في السيرفر' });
    }
});

// 📅 جلب الفترات المتاحة لدكتور في تاريخ معين
router.get('/available-slots', async (req, res) => {
    try {
        const { doctor_id, date } = req.query;

        console.log('🔍 جلب الفترات المتاحة:');
        console.log('   الدكتور:', doctor_id);
        console.log('   التاريخ:', date);

        if (!doctor_id || !date) {
            return res.status(400).json({ 
                success: false,
                error: '❌ الدكتور والتاريخ مطلوبين' 
            });
        }

        // ✅ تحويل التاريخ لـ day_of_week باللغة الإنجليزية
        const dateObj = new Date(date + 'T00:00:00');
        const dayOfWeek = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
        
        console.log('   اليوم:', dayOfWeek);

        // ✅ جلب الفترات المتاحة
        const { data, error } = await supabase
            .from('time_slots')
            .select(`
                *,
                bookings:bookings(count)
            `)
            .eq('doctor_id', doctor_id)
            .eq('day_of_week', dayOfWeek)
            .eq('is_active', true);

        if (error) {
            console.error('❌ خطأ في قاعدة البيانات:', error);
            return res.status(500).json({ 
                success: false,
                error: error.message 
            });
        }

        console.log('📊 عدد الفترات:', data?.length || 0);

        // حساب الفترات المتاحة
        const availableSlots = data
            .map(slot => {
                const bookedCount = slot.bookings[0]?.count || 0;
                return {
                    ...slot,
                    booked_count: bookedCount,
                    available_slots: slot.max_bookings - bookedCount,
                    is_available: (slot.max_bookings - bookedCount) > 0
                };
            })
            .filter(slot => slot.is_available);

        console.log('✅ الفترات المتاحة:', availableSlots.length);

        res.json({
            success: true,
            available_slots: availableSlots
        });
    } catch (error) {
        console.error('❌ خطأ في جلب الفترات:', error);
        res.status(500).json({ 
            success: false,
            error: '❌ حدث خطأ في السيرفر' 
        });
    }
});

module.exports = router;