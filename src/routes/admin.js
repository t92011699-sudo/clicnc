 const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { supabaseAdmin } = require('../config/supabase');
const { authenticate, isSuperAdmin } = require('../middleware/auth');

// ============================================
// 👑 إدارة الأقسام (سوبر أدمن فقط)
// ============================================

// 1. جلب كل الأقسام
router.get('/departments', authenticate, isSuperAdmin, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
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
        res.status(500).json({ error: error.message });
    }
});

// 2. إضافة قسم جديد
router.post('/departments', authenticate, isSuperAdmin, async (req, res) => {
    try {
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({ error: '❌ اسم القسم مطلوب' });
        }

        const { data: existing } = await supabaseAdmin
            .from('departments')
            .select('id')
            .eq('name', name)
            .single();

        if (existing) {
            return res.status(400).json({ error: '❌ هذا القسم موجود بالفعل' });
        }

        const { data, error } = await supabaseAdmin
            .from('departments')
            .insert({ name })
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({
            success: true,
            message: '✅ تم إضافة القسم بنجاح',
            department: data
        });
    } catch (error) {
        console.error('Add department error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 3. تعديل اسم القسم
router.put('/departments/:id', authenticate, isSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({ error: '❌ اسم القسم مطلوب' });
        }

        const { data, error } = await supabaseAdmin
            .from('departments')
            .update({ name })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            message: '✅ تم تعديل القسم بنجاح',
            department: data
        });
    } catch (error) {
        console.error('Update department error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 4. حذف قسم
router.delete('/departments/:id', authenticate, isSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const { data: doctors } = await supabaseAdmin
            .from('doctors')
            .select('id')
            .eq('department_id', id);

        if (doctors && doctors.length > 0) {
            return res.status(400).json({ 
                error: '❌ لا يمكن حذف القسم لأنه يحتوي على دكاترة. قم بنقلهم أولاً.' 
            });
        }

        await supabaseAdmin
            .from('departments')
            .delete()
            .eq('id', id);

        res.json({
            success: true,
            message: '✅ تم حذف القسم بنجاح'
        });
    } catch (error) {
        console.error('Delete department error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// 👑 إدارة الدكاترة (سوبر أدمن فقط)
// ============================================

// 1. إضافة دكتور جديد
router.post('/doctors', authenticate, isSuperAdmin, async (req, res) => {
    try {
        const { department_id, gender } = req.body;

        if (!department_id) {
            return res.status(400).json({ error: '❌ القسم مطلوب' });
        }

        const { data: department } = await supabaseAdmin
            .from('departments')
            .select('id')
            .eq('id', department_id)
            .single();

        if (!department) {
            return res.status(404).json({ error: '❌ القسم غير موجود' });
        }

        const title = gender === 'female' ? 'دكتورة' : 'دكتور';

        const { data: doctor, error } = await supabaseAdmin
            .from('doctors')
            .insert({
                name: title,
                title: title,
                department_id,
                gender: gender || 'male',
                is_super_admin: false,
                is_active: true,
                email: null,
                password_hash: null
            })
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({
            success: true,
            message: `✅ تم إضافة ${title} بنجاح`,
            doctor
        });
    } catch (error) {
        console.error('Add doctor error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 2. جلب كل الدكاترة
router.get('/doctors', authenticate, isSuperAdmin, async (req, res) => {
    try {
        const { data: doctors, error } = await supabaseAdmin
            .from('doctors')
            .select(`
                *,
                department:departments(name)
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;

        doctors.forEach(d => delete d.password_hash);

        res.json({
            success: true,
            doctors
        });
    } catch (error) {
        console.error('Get doctors error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 3. جلب دكاترة قسم معين
router.get('/doctors/department/:departmentId', authenticate, isSuperAdmin, async (req, res) => {
    try {
        const { departmentId } = req.params;

        const { data, error } = await supabaseAdmin
            .from('doctors')
            .select('*')
            .eq('department_id', departmentId)
            .order('name');

        if (error) throw error;

        data.forEach(d => delete d.password_hash);

        res.json({
            success: true,
            doctors: data
        });
    } catch (error) {
        console.error('Get department doctors error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 4. حذف دكتور
router.delete('/doctors/:id', authenticate, isSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        if (id === req.user.id) {
            return res.status(400).json({ error: '❌ لا يمكنك حذف حسابك الخاص' });
        }

        await supabaseAdmin
            .from('doctors')
            .delete()
            .eq('id', id);

        res.json({
            success: true,
            message: '✅ تم حذف الدكتور بنجاح'
        });
    } catch (error) {
        console.error('Delete doctor error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 5. تعطيل/تفعيل دكتور
router.patch('/doctors/:id/toggle-status', authenticate, isSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { is_active } = req.body;

        if (id === req.user.id) {
            return res.status(400).json({ error: '❌ لا يمكنك تعديل حالة حسابك الخاص' });
        }

        await supabaseAdmin
            .from('doctors')
            .update({ is_active })
            .eq('id', id);

        res.json({
            success: true,
            message: `✅ تم ${is_active ? 'تفعيل' : 'تعطيل'} الدكتور بنجاح`
        });
    } catch (error) {
        console.error('Toggle doctor error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// 👑 إدارة الفترات الزمنية (سوبر أدمن فقط)
// ============================================

// 1. إضافة فترة زمنية لدكتور
router.post('/time-slots', authenticate, isSuperAdmin, async (req, res) => {
    try {
        const { doctor_id, day_of_week, start_time, end_time, max_bookings = 3 } = req.body;

        if (!doctor_id || !day_of_week || !start_time || !end_time) {
            return res.status(400).json({ error: '❌ جميع الحقول مطلوبة' });
        }

        // التحقق من وجود الدكتور
        const { data: doctor } = await supabaseAdmin
            .from('doctors')
            .select('id, name')
            .eq('id', doctor_id)
            .single();

        if (!doctor) {
            return res.status(404).json({ error: '❌ الدكتور غير موجود' });
        }

        // التحقق من عدم وجود فترة مكررة
        const { data: existing } = await supabaseAdmin
            .from('time_slots')
            .select('id')
            .eq('doctor_id', doctor_id)
            .eq('day_of_week', day_of_week)
            .eq('start_time', start_time)
            .eq('end_time', end_time)
            .single();

        if (existing) {
            return res.status(400).json({ error: '❌ هذه الفترة موجودة بالفعل' });
        }

        const { data, error } = await supabaseAdmin
            .from('time_slots')
            .insert({
                doctor_id,
                day_of_week,
                start_time,
                end_time,
                max_bookings: max_bookings || 3,
                is_active: true
            })
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({
            success: true,
            message: `✅ تم إضافة الفترة بنجاح للدكتور ${doctor.name}`,
            time_slot: data
        });
    } catch (error) {
        console.error('Add time slot error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 2. جلب كل فترات دكتور معين (مرتبة حسب الأيام)
router.get('/time-slots/doctor/:doctorId', authenticate, isSuperAdmin, async (req, res) => {
    try {
        const { doctorId } = req.params;

        const { data, error } = await supabaseAdmin
            .from('time_slots')
            .select(`
                *,
                bookings:bookings(count)
            `)
            .eq('doctor_id', doctorId)
            .order('day_of_week')
            .order('start_time');

        if (error) throw error;

        const dayNames = {
            'Sunday': 'الأحد',
            'Monday': 'الإثنين',
            'Tuesday': 'الثلاثاء',
            'Wednesday': 'الأربعاء',
            'Thursday': 'الخميس',
            'Friday': 'الجمعة',
            'Saturday': 'السبت'
        };

        // تجميع الفترات حسب اليوم
        const groupedSlots = {};
        data.forEach(slot => {
            const day = slot.day_of_week;
            if (!groupedSlots[day]) {
                groupedSlots[day] = [];
            }
            groupedSlots[day].push({
                ...slot,
                day_name: dayNames[day] || day,
                booked_count: slot.bookings[0]?.count || 0,
                available_slots: slot.max_bookings - (slot.bookings[0]?.count || 0),
                is_available: (slot.max_bookings - (slot.bookings[0]?.count || 0)) > 0
            });
        });

        res.json({
            success: true,
            time_slots: groupedSlots
        });
    } catch (error) {
        console.error('Get time slots error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 3. تعديل فترة زمنية
router.put('/time-slots/:id', authenticate, isSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { start_time, end_time, max_bookings, is_active } = req.body;

        const updateData = {};
        if (start_time) updateData.start_time = start_time;
        if (end_time) updateData.end_time = end_time;
        if (max_bookings) updateData.max_bookings = parseInt(max_bookings);
        if (is_active !== undefined) updateData.is_active = is_active;

        const { data, error } = await supabaseAdmin
            .from('time_slots')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            message: '✅ تم تعديل الفترة بنجاح',
            time_slot: data
        });
    } catch (error) {
        console.error('Update time slot error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 4. حذف فترة زمنية
router.delete('/time-slots/:id', authenticate, isSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // التحقق من وجود حجوزات على هذه الفترة
        const { data: bookings } = await supabaseAdmin
            .from('bookings')
            .select('id')
            .eq('time_slot_id', id);

        if (bookings && bookings.length > 0) {
            return res.status(400).json({ 
                error: `❌ لا يمكن حذف الفترة لأنه يوجد ${bookings.length} حجوزات عليها` 
            });
        }

        await supabaseAdmin
            .from('time_slots')
            .delete()
            .eq('id', id);

        res.json({
            success: true,
            message: '✅ تم حذف الفترة بنجاح'
        });
    } catch (error) {
        console.error('Delete time slot error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 5. جلب الفترات المتاحة لدكتور في يوم معين (للمستخدمين)
router.get('/available-slots', async (req, res) => {
    try {
        const { doctor_id, date } = req.query;

        if (!doctor_id || !date) {
            return res.status(400).json({ 
                success: false,
                error: '❌ الدكتور والتاريخ مطلوبين' 
            });
        }

        // استخراج اليوم من التاريخ
        const dateObj = new Date(date + 'T00:00:00');
        const dayOfWeek = dateObj.toLocaleDateString('en-US', { weekday: 'long' });

        // جلب الفترات المتاحة لهذا اليوم
        const { data, error } = await supabaseAdmin
            .from('time_slots')
            .select(`
                *,
                bookings:bookings(count)
            `)
            .eq('doctor_id', doctor_id)
            .eq('day_of_week', dayOfWeek)
            .eq('is_active', true)
            .order('start_time');

        if (error) {
            return res.status(500).json({ 
                success: false,
                error: error.message 
            });
        }

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

        res.json({
            success: true,
            available_slots: availableSlots
        });
    } catch (error) {
        console.error('❌ خطأ في جلب الفترات:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ============================================
// 👑 الحجوزات (سوبر أدمن فقط)
// ============================================

// 1. جلب كل الحجوزات
router.get('/all-bookings', authenticate, isSuperAdmin, async (req, res) => {
    try {
        console.log('📊 جلب كل الحجوزات...');

        const { data, error } = await supabaseAdmin
            .from('bookings')
            .select('*')
            .order('booking_date', { ascending: false });

        if (error) {
            console.error('❌ خطأ في جلب الحجوزات:', error);
            return res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }

        console.log(`✅ تم جلب ${data?.length || 0} حجز`);

        if (!data || data.length === 0) {
            return res.json({
                success: true,
                bookings: []
            });
        }

        const formattedBookings = data.map(b => ({
            ...b,
            booking_date: b.booking_date ? new Date(b.booking_date).toISOString().split('T')[0] : null
        }));

        res.json({
            success: true,
            bookings: formattedBookings
        });
    } catch (error) {
        console.error('❌ خطأ في جلب الحجوزات:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// 2. جلب حجوزات دكتور معين
router.get('/bookings/doctor/:doctorId', authenticate, isSuperAdmin, async (req, res) => {
    try {
        const { doctorId } = req.params;

        const { data, error } = await supabaseAdmin
            .from('bookings')
            .select('*')
            .eq('doctor_id', doctorId)
            .order('booking_date', { ascending: false });

        if (error) throw error;

        res.json({
            success: true,
            bookings: data || []
        });
    } catch (error) {
        console.error('Get doctor bookings error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;