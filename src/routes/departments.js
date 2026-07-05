 const express = require('express');
const router = express.Router();
const { supabase, supabaseAdmin } = require('../config/supabase');
const { authenticate, isSuperAdmin } = require('../middleware/auth');

// ============================================
// 1. الأقسام (Departments)
// ============================================

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
            total_slots_count: dept.doctors[0]?.count || 0
        }));

        res.json({
            success: true,
            departments,
            total: departments.length
        });
    } catch (error) {
        console.error('Get departments error:', error);
        res.status(500).json({ 
            success: false,
            error: { code: 'SERVER_ERROR', message: '❌ حدث خطأ في السيرفر' } 
        });
    }
});

// 📂 جلب تفاصيل قسم واحد (Expanded)
router.get('/:departmentId', async (req, res) => {
    try {
        const { departmentId } = req.params;

        // جلب القسم
        const { data: department, error: deptError } = await supabase
            .from('departments')
            .select('*')
            .eq('id', departmentId)
            .single();

        if (deptError || !department) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: '❌ القسم غير موجود' }
            });
        }

        // جلب دكاترة القسم (بدون توكن للعرض)
        const { data: doctors, error: docsError } = await supabase
            .from('doctors')
            .select(`
                id,
                title,
                gender,
                is_active,
                department_id
            `)
            .eq('department_id', departmentId)
            .order('name');

        if (docsError) throw docsError;

        // تجميع الدكاترة حسب النوع (male/female)
        const doctorTypes = {};
        doctors.forEach(doc => {
            const type = doc.gender || 'male';
            if (!doctorTypes[type]) {
                doctorTypes[type] = {
                    type: type,
                    label: type === 'female' ? 'دكتورة' : 'دكتور',
                    enabled: doc.is_active,
                    doctors: []
                };
            }
            doctorTypes[type].doctors.push({
                id: doc.id,
                title: doc.title,
                is_active: doc.is_active
            });
        });

        // جلب الفترات لكل دكتور
        const doctorTypesArray = await Promise.all(
            Object.values(doctorTypes).map(async (typeData) => {
                const doctorIds = typeData.doctors.map(d => d.id);
                
                // جلب الفترات الثابتة
                const { data: fixedSlots } = await supabase
                    .from('time_slots')
                    .select('*')
                    .in('doctor_id', doctorIds)
                    .is('is_custom', false)
                    .eq('is_active', true)
                    .order('start_time');

                // جلب الفترات المخصصة (ليوم معين)
                const { data: customSlots } = await supabase
                    .from('time_slots')
                    .select('*')
                    .in('doctor_id', doctorIds)
                    .eq('is_custom', true)
                    .eq('is_active', true)
                    .order('start_time');

                return {
                    ...typeData,
                    fixed_slots: fixedSlots || [],
                    custom_slots: customSlots || []
                };
            })
        );

        res.json({
            ...department,
            total_slots_count: doctors.length,
            doctor_types: doctorTypesArray,
            created_at: department.created_at,
            updated_at: department.updated_at
        });
    } catch (error) {
        console.error('Get department error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: '❌ حدث خطأ في السيرفر' }
        });
    }
});

// ➕ إنشاء قسم جديد
router.post('/', authenticate, isSuperAdmin, async (req, res) => {
    try {
        const { name, icon_url, doctor_types } = req.body;

        if (!name) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: '❌ اسم القسم مطلوب' }
            });
        }

        // التحقق من عدم وجود القسم
        const { data: existing } = await supabaseAdmin
            .from('departments')
            .select('id')
            .eq('name', name)
            .single();

        if (existing) {
            return res.status(400).json({
                success: false,
                error: { code: 'DUPLICATE', message: '❌ هذا القسم موجود بالفعل' }
            });
        }

        // إضافة القسم
        const { data: department, error } = await supabaseAdmin
            .from('departments')
            .insert({ 
                name, 
                icon_url: icon_url || null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) throw error;

        // إضافة أنواع الدكاترة (دكتور/دكتورة) إذا وجدت
        if (doctor_types && doctor_types.length > 0) {
            for (const type of doctor_types) {
                if (type.enabled) {
                    const title = type.type === 'female' ? 'دكتورة' : 'دكتور';
                    await supabaseAdmin
                        .from('doctors')
                        .insert({
                            name: title,
                            title: title,
                            gender: type.type,
                            department_id: department.id,
                            is_super_admin: false,
                            is_active: true,
                            email: null,
                            password_hash: null
                        });
                }
            }
        }

        res.status(201).json({
            id: department.id,
            name: department.name,
            icon_url: department.icon_url,
            total_slots_count: 0,
            doctor_types: doctor_types || [],
            created_at: department.created_at,
            updated_at: department.updated_at
        });
    } catch (error) {
        console.error('Create department error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: '❌ حدث خطأ في السيرفر' }
        });
    }
});

// ✏️ تعديل اسم/أيقونة القسم
router.put('/:departmentId', authenticate, isSuperAdmin, async (req, res) => {
    try {
        const { departmentId } = req.params;
        const { name, icon_url } = req.body;

        const { data, error } = await supabaseAdmin
            .from('departments')
            .update({ 
                name, 
                icon_url: icon_url || null,
                updated_at: new Date().toISOString()
            })
            .eq('id', departmentId)
            .select()
            .single();

        if (error) throw error;

        res.json({
            id: data.id,
            name: data.name,
            icon_url: data.icon_url,
            updated_at: data.updated_at
        });
    } catch (error) {
        console.error('Update department error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: '❌ حدث خطأ في السيرفر' }
        });
    }
});

// 🗑️ حذف قسم
router.delete('/:departmentId', authenticate, isSuperAdmin, async (req, res) => {
    try {
        const { departmentId } = req.params;

        // التحقق من وجود دكاترة في القسم
        const { data: doctors } = await supabaseAdmin
            .from('doctors')
            .select('id')
            .eq('department_id', departmentId);

        if (doctors && doctors.length > 0) {
            return res.status(400).json({
                success: false,
                error: { code: 'HAS_DOCTORS', message: '❌ لا يمكن حذف القسم لأنه يحتوي على دكاترة' }
            });
        }

        await supabaseAdmin
            .from('departments')
            .delete()
            .eq('id', departmentId);

        res.json({
            success: true,
            deleted_id: parseInt(departmentId)
        });
    } catch (error) {
        console.error('Delete department error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: '❌ حدث خطأ في السيرفر' }
        });
    }
});

// 🔄 ترتيب الأقسام (Reorder)
router.patch('/reorder', authenticate, isSuperAdmin, async (req, res) => {
    try {
        const { ordered_ids } = req.body;

        if (!ordered_ids || !Array.isArray(ordered_ids)) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: '❌ ordered_ids مطلوب كمصفوفة' }
            });
        }

        // تحديث ترتيب الأقسام (حسب الحاجة)
        for (let i = 0; i < ordered_ids.length; i++) {
            await supabaseAdmin
                .from('departments')
                .update({ order: i + 1 })
                .eq('id', ordered_ids[i]);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Reorder departments error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: '❌ حدث خطأ في السيرفر' }
        });
    }
});

// ============================================
// 2. أنواع الأطباء (Doctor Types)
// ============================================

// 🔄 تفعيل/تعطيل نوع الطبيب
router.put('/:departmentId/doctor-types', authenticate, isSuperAdmin, async (req, res) => {
    try {
        const { departmentId } = req.params;
        const { doctor_types } = req.body;

        if (!doctor_types || !Array.isArray(doctor_types)) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: '❌ doctor_types مطلوب كمصفوفة' }
            });
        }

        // تحديث حالة الدكاترة في القسم حسب النوع
        for (const type of doctor_types) {
            await supabaseAdmin
                .from('doctors')
                .update({ is_active: type.enabled })
                .eq('department_id', departmentId)
                .eq('gender', type.type);
        }

        res.json({
            department_id: parseInt(departmentId),
            doctor_types: doctor_types.map(t => ({
                type: t.type,
                label: t.type === 'female' ? 'دكتورة' : 'دكتور',
                enabled: t.enabled
            }))
        });
    } catch (error) {
        console.error('Update doctor types error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: '❌ حدث خطأ في السيرفر' }
        });
    }
});

// ============================================
// 3. الفترات الثابتة (Fixed Slots)
// ============================================

// 📅 جلب الفترات الثابتة
router.get('/:departmentId/doctor-types/:doctorType/fixed-slots', async (req, res) => {
    try {
        const { departmentId, doctorType } = req.params;

        // جلب الدكاترة في القسم من هذا النوع
        const { data: doctors } = await supabase
            .from('doctors')
            .select('id')
            .eq('department_id', departmentId)
            .eq('gender', doctorType)
            .eq('is_active', true);

        if (!doctors || doctors.length === 0) {
            return res.json({
                doctor_type: doctorType,
                fixed_slots: []
            });
        }

        const doctorIds = doctors.map(d => d.id);

        // جلب الفترات الثابتة
        const { data: fixedSlots } = await supabase
            .from('time_slots')
            .select('*')
            .in('doctor_id', doctorIds)
            .eq('is_custom', false)
            .eq('is_active', true)
            .order('start_time');

        res.json({
            doctor_type: doctorType,
            fixed_slots: fixedSlots || []
        });
    } catch (error) {
        console.error('Get fixed slots error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: '❌ حدث خطأ في السيرفر' }
        });
    }
});

// ➕ إضافة فترة ثابتة
router.post('/:departmentId/doctor-types/:doctorType/fixed-slots', authenticate, isSuperAdmin, async (req, res) => {
    try {
        const { departmentId, doctorType } = req.params;
        const { capacity, from_time, to_time } = req.body;

        if (!capacity || !from_time || !to_time) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: '❌ capacity, from_time, to_time مطلوبين' }
            });
        }

        if (from_time >= to_time) {
            return res.status(422).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: '❌ وقت البداية لازم يكون أقل من وقت النهاية', field: 'to_time' }
            });
        }

        // جلب دكتور في القسم من هذا النوع
        const { data: doctor } = await supabaseAdmin
            .from('doctors')
            .select('id')
            .eq('department_id', departmentId)
            .eq('gender', doctorType)
            .eq('is_active', true)
            .limit(1)
            .single();

        if (!doctor) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: '❌ لا يوجد دكتور من هذا النوع في القسم' }
            });
        }

        // إضافة الفترة
        const { data: slot, error } = await supabaseAdmin
            .from('time_slots')
            .insert({
                doctor_id: doctor.id,
                day_of_week: 'Sunday', // افتراضي - سيتم تعديله حسب الحاجة
                start_time: from_time + ':00',
                end_time: to_time + ':00',
                max_bookings: capacity,
                is_active: true,
                is_custom: false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({
            id: slot.id,
            doctor_type: doctorType,
            capacity: slot.max_bookings,
            from_time: slot.start_time.substring(0, 5),
            to_time: slot.end_time.substring(0, 5),
            order: 1
        });
    } catch (error) {
        console.error('Add fixed slot error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: '❌ حدث خطأ في السيرفر' }
        });
    }
});

// ✏️ تعديل فترة ثابتة
router.put('/:departmentId/doctor-types/:doctorType/fixed-slots/:slotId', authenticate, isSuperAdmin, async (req, res) => {
    try {
        const { slotId } = req.params;
        const { capacity, from_time, to_time } = req.body;

        const updateData = {};
        if (capacity) updateData.max_bookings = capacity;
        if (from_time) updateData.start_time = from_time + ':00';
        if (to_time) updateData.end_time = to_time + ':00';
        updateData.updated_at = new Date().toISOString();

        const { data, error } = await supabaseAdmin
            .from('time_slots')
            .update(updateData)
            .eq('id', slotId)
            .select()
            .single();

        if (error) throw error;

        res.json({
            id: data.id,
            capacity: data.max_bookings,
            from_time: data.start_time.substring(0, 5),
            to_time: data.end_time.substring(0, 5)
        });
    } catch (error) {
        console.error('Update fixed slot error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: '❌ حدث خطأ في السيرفر' }
        });
    }
});

// 🗑️ حذف فترة ثابتة
router.delete('/:departmentId/doctor-types/:doctorType/fixed-slots/:slotId', authenticate, isSuperAdmin, async (req, res) => {
    try {
        const { slotId } = req.params;

        await supabaseAdmin
            .from('time_slots')
            .delete()
            .eq('id', slotId);

        res.json({
            success: true,
            deleted_id: parseInt(slotId)
        });
    } catch (error) {
        console.error('Delete fixed slot error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: '❌ حدث خطأ في السيرفر' }
        });
    }
});

// 🔄 ترتيب الفترات الثابتة (Reorder)
router.patch('/:departmentId/doctor-types/:doctorType/fixed-slots/reorder', authenticate, isSuperAdmin, async (req, res) => {
    try {
        const { ordered_ids } = req.body;

        if (!ordered_ids || !Array.isArray(ordered_ids)) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: '❌ ordered_ids مطلوب كمصفوفة' }
            });
        }

        // تحديث ترتيب الفترات
        for (let i = 0; i < ordered_ids.length; i++) {
            await supabaseAdmin
                .from('time_slots')
                .update({ order: i + 1 })
                .eq('id', ordered_ids[i]);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Reorder fixed slots error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: '❌ حدث خطأ في السيرفر' }
        });
    }
});

// ============================================
// 4. فترات يوم معين (Custom Slots)
// ============================================

// 📅 جلب فترات يوم محدد
router.get('/:departmentId/doctor-types/:doctorType/custom-slots', async (req, res) => {
    try {
        const { departmentId, doctorType } = req.params;
        const { date } = req.query;

        if (!date) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: '❌ date مطلوب' }
            });
        }

        // جلب الدكاترة في القسم من هذا النوع
        const { data: doctors } = await supabase
            .from('doctors')
            .select('id')
            .eq('department_id', departmentId)
            .eq('gender', doctorType)
            .eq('is_active', true);

        if (!doctors || doctors.length === 0) {
            return res.json({
                doctor_type: doctorType,
                date: date,
                custom_slots: []
            });
        }

        const doctorIds = doctors.map(d => d.id);

        // جلب الفترات المخصصة لهذا اليوم
        const dateObj = new Date(date + 'T00:00:00');
        const dayOfWeek = dateObj.toLocaleDateString('en-US', { weekday: 'long' });

        const { data: customSlots } = await supabase
            .from('time_slots')
            .select('*')
            .in('doctor_id', doctorIds)
            .eq('day_of_week', dayOfWeek)
            .eq('is_custom', true)
            .eq('is_active', true)
            .order('start_time');

        res.json({
            doctor_type: doctorType,
            date: date,
            custom_slots: customSlots || []
        });
    } catch (error) {
        console.error('Get custom slots error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: '❌ حدث خطأ في السيرفر' }
        });
    }
});

// ➕ إضافة/تخصيص فترة ليوم معين
router.post('/:departmentId/doctor-types/:doctorType/custom-slots', authenticate, isSuperAdmin, async (req, res) => {
    try {
        const { departmentId, doctorType } = req.params;
        const { date, capacity, from_time, to_time } = req.body;

        if (!date || !capacity || !from_time || !to_time) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: '❌ جميع الحقول مطلوبة' }
            });
        }

        if (from_time >= to_time) {
            return res.status(422).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: '❌ وقت البداية لازم يكون أقل من وقت النهاية', field: 'to_time' }
            });
        }

        // جلب دكتور في القسم من هذا النوع
        const { data: doctor } = await supabaseAdmin
            .from('doctors')
            .select('id')
            .eq('department_id', departmentId)
            .eq('gender', doctorType)
            .eq('is_active', true)
            .limit(1)
            .single();

        if (!doctor) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: '❌ لا يوجد دكتور من هذا النوع في القسم' }
            });
        }

        const dateObj = new Date(date + 'T00:00:00');
        const dayOfWeek = dateObj.toLocaleDateString('en-US', { weekday: 'long' });

        // إضافة الفترة المخصصة
        const { data: slot, error } = await supabaseAdmin
            .from('time_slots')
            .insert({
                doctor_id: doctor.id,
                day_of_week: dayOfWeek,
                start_time: from_time + ':00',
                end_time: to_time + ':00',
                max_bookings: capacity,
                is_active: true,
                is_custom: true,
                custom_date: date,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({
            id: slot.id,
            date: date,
            capacity: slot.max_bookings,
            from_time: slot.start_time.substring(0, 5),
            to_time: slot.end_time.substring(0, 5)
        });
    } catch (error) {
        console.error('Add custom slot error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: '❌ حدث خطأ في السيرفر' }
        });
    }
});

// ✏️ تعديل فترة يوم معين
router.put('/:departmentId/doctor-types/:doctorType/custom-slots/:slotId', authenticate, isSuperAdmin, async (req, res) => {
    try {
        const { slotId } = req.params;
        const { capacity, from_time, to_time } = req.body;

        const updateData = {};
        if (capacity) updateData.max_bookings = capacity;
        if (from_time) updateData.start_time = from_time + ':00';
        if (to_time) updateData.end_time = to_time + ':00';
        updateData.updated_at = new Date().toISOString();

        const { data, error } = await supabaseAdmin
            .from('time_slots')
            .update(updateData)
            .eq('id', slotId)
            .select()
            .single();

        if (error) throw error;

        res.json({
            id: data.id,
            capacity: data.max_bookings,
            from_time: data.start_time.substring(0, 5),
            to_time: data.end_time.substring(0, 5)
        });
    } catch (error) {
        console.error('Update custom slot error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: '❌ حدث خطأ في السيرفر' }
        });
    }
});

// 🗑️ حذف فترة يوم معين
router.delete('/:departmentId/doctor-types/:doctorType/custom-slots/:slotId', authenticate, isSuperAdmin, async (req, res) => {
    try {
        const { slotId } = req.params;

        await supabaseAdmin
            .from('time_slots')
            .delete()
            .eq('id', slotId);

        res.json({
            success: true,
            deleted_id: parseInt(slotId)
        });
    } catch (error) {
        console.error('Delete custom slot error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: '❌ حدث خطأ في السيرفر' }
        });
    }
});

// ============================================
// 5. حفظ كل تعديلات القسم دفعة واحدة (Save)
// ============================================

// 💾 حفظ (Save) قسم كامل
router.put('/:departmentId/save', authenticate, isSuperAdmin, async (req, res) => {
    try {
        const { departmentId } = req.params;
        const { name, icon_url, doctor_types } = req.body;

        // 1. تحديث معلومات القسم
        await supabaseAdmin
            .from('departments')
            .update({ 
                name, 
                icon_url: icon_url || null,
                updated_at: new Date().toISOString()
            })
            .eq('id', departmentId);

        // 2. معالجة كل نوع من الدكاترة
        for (const type of doctor_types) {
            // جلب دكتور من هذا النوع في القسم
            let { data: doctor } = await supabaseAdmin
                .from('doctors')
                .select('id')
                .eq('department_id', departmentId)
                .eq('gender', type.type)
                .maybeSingle();

            // إذا لم يوجد دكتور من هذا النوع، نضيفه
            if (!doctor && type.enabled) {
                const title = type.type === 'female' ? 'دكتورة' : 'دكتور';
                const { data: newDoctor } = await supabaseAdmin
                    .from('doctors')
                    .insert({
                        name: title,
                        title: title,
                        gender: type.type,
                        department_id: departmentId,
                        is_super_admin: false,
                        is_active: true,
                        email: null,
                        password_hash: null
                    })
                    .select()
                    .single();
                doctor = newDoctor;
            }

            if (doctor) {
                // تحديث حالة الدكتور
                await supabaseAdmin
                    .from('doctors')
                    .update({ is_active: type.enabled })
                    .eq('id', doctor.id);

                // معالجة الفترات الثابتة
                if (type.fixed_slots) {
                    for (const slot of type.fixed_slots) {
                        if (slot.id) {
                            // تحديث فترة موجودة
                            await supabaseAdmin
                                .from('time_slots')
                                .update({
                                    max_bookings: slot.capacity,
                                    start_time: slot.from_time + ':00',
                                    end_time: slot.to_time + ':00',
                                    updated_at: new Date().toISOString()
                                })
                                .eq('id', slot.id);
                        } else if (slot.from_time && slot.to_time) {
                            // إضافة فترة جديدة
                            await supabaseAdmin
                                .from('time_slots')
                                .insert({
                                    doctor_id: doctor.id,
                                    day_of_week: 'Sunday',
                                    start_time: slot.from_time + ':00',
                                    end_time: slot.to_time + ':00',
                                    max_bookings: slot.capacity || 3,
                                    is_active: true,
                                    is_custom: false,
                                    created_at: new Date().toISOString(),
                                    updated_at: new Date().toISOString()
                                });
                        }
                    }
                }

                // معالجة الفترات المخصصة
                if (type.custom_slots) {
                    for (const slot of type.custom_slots) {
                        const dateObj = new Date(slot.date + 'T00:00:00');
                        const dayOfWeek = dateObj.toLocaleDateString('en-US', { weekday: 'long' });

                        if (slot.id) {
                            // تحديث فترة موجودة
                            await supabaseAdmin
                                .from('time_slots')
                                .update({
                                    max_bookings: slot.capacity,
                                    start_time: slot.from_time + ':00',
                                    end_time: slot.to_time + ':00',
                                    day_of_week: dayOfWeek,
                                    updated_at: new Date().toISOString()
                                })
                                .eq('id', slot.id);
                        } else if (slot.from_time && slot.to_time) {
                            // إضافة فترة جديدة
                            await supabaseAdmin
                                .from('time_slots')
                                .insert({
                                    doctor_id: doctor.id,
                                    day_of_week: dayOfWeek,
                                    start_time: slot.from_time + ':00',
                                    end_time: slot.to_time + ':00',
                                    max_bookings: slot.capacity || 3,
                                    is_active: true,
                                    is_custom: true,
                                    custom_date: slot.date,
                                    created_at: new Date().toISOString(),
                                    updated_at: new Date().toISOString()
                                });
                        }
                    }
                }
            }
        }

        // 3. جلب البيانات المحدثة للرد
        const { data: updatedDepartment } = await supabase
            .from('departments')
            .select('*')
            .eq('id', departmentId)
            .single();

        // جلب الدكاترة المحدثين
        const { data: updatedDoctors } = await supabase
            .from('doctors')
            .select('*')
            .eq('department_id', departmentId);

        // جلب الفترات المحدثة
        const doctorIds = updatedDoctors.map(d => d.id);
        const { data: updatedSlots } = await supabase
            .from('time_slots')
            .select('*')
            .in('doctor_id', doctorIds);

        res.json({
            id: departmentId,
            name: updatedDepartment.name,
            icon_url: updatedDepartment.icon_url,
            total_slots_count: updatedDoctors.length,
            doctor_types: doctor_types.map(type => ({
                ...type,
                fixed_slots: updatedSlots.filter(s => !s.is_custom && s.doctor_id === type.doctor_id),
                custom_slots: updatedSlots.filter(s => s.is_custom && s.doctor_id === type.doctor_id)
            })),
            updated_at: new Date().toISOString()
        });
    } catch (error) {
        console.error('Save department error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: '❌ حدث خطأ في السيرفر' }
        });
    }
});

module.exports = router;