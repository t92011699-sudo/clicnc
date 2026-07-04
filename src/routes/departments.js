const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

// جلب كل الأقسام
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('departments')
      .select('*')
      .order('name');

    if (error) throw error;

    res.json({
      success: true,
      departments: data
    });
  } catch (error) {
    console.error('Get departments error:', error);
    res.status(500).json({ error: '❌ حدث خطأ في السيرفر' });
  }
});

// جلب دكاترة قسم معين
router.get('/:departmentId/doctors', async (req, res) => {
  try {
    const { departmentId } = req.params;

    const { data, error } = await supabase
      .from('doctors')
      .select('id, name, email')
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

module.exports = router;