const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { supabaseAdmin } = require('../config/supabase');
const { authenticate } = require('../middleware/auth');

// تسجيل الدخول
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: '❌ الإيميل والباسورد مطلوبين' });
    }

    const { data: doctor, error } = await supabaseAdmin
      .from('doctors')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !doctor) {
      return res.status(401).json({ error: '❌ الإيميل أو الباسورد غير صحيح' });
    }

    if (!doctor.is_active) {
      return res.status(403).json({ error: '❌ الحساب معطل' });
    }

    const isValid = await bcrypt.compare(password, doctor.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: '❌ الإيميل أو الباسورد غير صحيح' });
    }

    const token = jwt.sign(
      { 
        id: doctor.id,
        email: doctor.email,
        name: doctor.name,
        is_super_admin: doctor.is_super_admin,
        department_id: doctor.department_id
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    delete doctor.password_hash;

    res.json({
      success: true,
      message: '✅ تم تسجيل الدخول بنجاح',
      token,
      doctor: {
        ...doctor,
        role: doctor.is_super_admin ? 'super_admin' : 'admin'
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: '❌ حدث خطأ في السيرفر' });
  }
});

// جلب معلومات الدكتور الحالي
router.get('/me', authenticate, async (req, res) => {
  try {
    const { data: doctor, error } = await supabaseAdmin
      .from('doctors')
      .select('*, department:departments(name)')
      .eq('id', req.user.id)
      .single();

    if (error) throw error;

    delete doctor.password_hash;

    res.json({
      success: true,
      doctor: {
        ...doctor,
        role: doctor.is_super_admin ? 'super_admin' : 'admin'
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: '❌ حدث خطأ في السيرفر' });
  }
});

module.exports = router;
