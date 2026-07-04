const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { supabaseAdmin } = require('../config/supabase');
const { authenticate, isSuperAdmin } = require('../middleware/auth');

// إضافة دكتور جديد
router.post('/doctors', authenticate, isSuperAdmin, async (req, res) => {
  try {
    const { email, password, name, department_id } = req.body;

    if (!email || !password || !name || !department_id) {
      return res.status(400).json({ error: '❌ جميع الحقول مطلوبة' });
    }

    const { data: existing } = await supabaseAdmin
      .from('doctors')
      .select('email')
      .eq('email', email)
      .single();

    if (existing) {
      return res.status(400).json({ error: '❌ هذا الإيميل موجود بالفعل' });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const { data: doctor, error } = await supabaseAdmin
      .from('doctors')
      .insert({
        email,
        password_hash,
        name,
        department_id,
        is_super_admin: false,
        is_active: true
      })
      .select()
      .single();

    if (error) throw error;

    delete doctor.password_hash;

    res.status(201).json({
      success: true,
      message: '✅ تم إضافة الدكتور بنجاح',
      doctor
    });
  } catch (error) {
    console.error('Add doctor error:', error);
    res.status(500).json({ error: '❌ حدث خطأ في السيرفر' });
  }
});

// جلب كل الدكاترة
router.get('/doctors', authenticate, isSuperAdmin, async (req, res) => {
  try {
    const { data: doctors, error } = await supabaseAdmin
      .from('doctors')
      .select('*, department:departments(name)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    doctors.forEach(d => delete d.password_hash);

    res.json({
      success: true,
      doctors
    });
  } catch (error) {
    console.error('Get doctors error:', error);
    res.status(500).json({ error: '❌ حدث خطأ في السيرفر' });
  }
});

// حذف دكتور
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
    res.status(500).json({ error: '❌ حدث خطأ في السيرفر' });
  }
});

// تعطيل/تفعيل دكتور
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
    res.status(500).json({ error: '❌ حدث خطأ في السيرفر' });
  }
});

module.exports = router;