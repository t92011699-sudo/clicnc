 const express = require('express');
const router = express.Router();
const { supabase, supabaseAdmin } = require('../config/supabase');
const { authenticate, isSuperAdmin } = require('../middleware/auth');

// 📂 جلب كل الأقسام (بدون توكن)
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

// 📂 جلب قسم واحد (بدون توكن)
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('departments')
            .select(`
                *,
                doctors:doctors(count)
            `)
            .eq('id', id)
            .single();

        if (error) throw error;

        res.json({
            success: true,
            department: {
                ...data,
                doctors_count: data.doctors[0]?.count || 0
            }
        });
    } catch (error) {
        console.error('Get department error:', error);
        res.status(500).json({ error: '❌ حدث خطأ في السيرفر' });
    }
});

// 📂 جلب دكاترة قسم معين (بدون توكن)
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

// ➕ إضافة قسم جديد (للسوبر أدمن)
router.post('/', authenticate, isSuperAdmin, async (req, res) => {
    try {
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({ error: '❌ اسم القسم مطلوب' });
        }

        // التحقق من عدم وجود القسم
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

// ✏️ تعديل قسم (للسوبر أدمن)
router.put('/:id', authenticate, isSuperAdmin, async (req, res) => {
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

// 🗑️ حذف قسم (للسوبر أدمن)
router.delete('/:id', authenticate, isSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // التحقق من وجود دكاترة في القسم
        const { data: doctors } = await supabaseAdmin
            .from('doctors')
            .select('id')
            .eq('department_id', id);

        if (doctors && doctors.length > 0) {
            return res.status(400).json({ 
                error: '❌ لا يمكن حذف القسم لأنه يحتوي على دكاترة' 
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

module.exports = router;