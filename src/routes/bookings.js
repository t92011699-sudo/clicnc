const express = require('express');
const router = express.Router();
const { supabase, supabaseAdmin } = require('../config/supabase');
const { authenticate } = require('../middleware/auth');

// حجز موعد
router.post('/', async (req, res) => {
  try {
    const { appointment_id, patient_name, patient_phone, patient_age, department_id } = req.body;

    if (!appointment_id || !patient_name || !patient_phone || !patient_age) {
      return res.status(400).json({ error: '❌ جميع الحقول مطلوبة' });
    }

    // التحقق من توفر الموعد
    const { data: appointment, error: appError } = await supabase
      .from('appointments')
      .select(`
        *,
        doctor:doctors(name),
        bookings:bookings(count)
      `)
      .eq('id', appointment_id)
      .single();

    if (appError || !appointment) {
      return res.status(404).json({ error: '❌ الموعد غير موجود' });
    }

    const bookedCount = appointment.bookings[0]?.count || 0;
    if (bookedCount >= appointment.max_bookings) {
      return res.status(400).json({ error: '❌ الموعد مكتمل، اختر موعداً آخر' });
    }

    // إنشاء الحجز
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from('bookings')
      .insert({
        appointment_id,
        patient_name,
        patient_phone,
        patient_age,
        department_id: department_id,
        status: 'confirmed'
      })
      .select(`
        *,
        appointment:appointments(
          time,
          day_of_week,
          doctor:doctors(name)
        )
      `)
      .single();

    if (bookingError) throw bookingError;

    res.status(201).json({
      success: true,
      message: '✅ تم الحجز بنجاح! سيصلك رسالة تأكيد',
      booking
    });
  } catch (error) {
    console.error('Create booking error:', error);
    res.status(500).json({ error: '❌ حدث خطأ في السيرفر' });
  }
});

// جلب حجوزات الدكتور
router.get('/my-bookings', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('bookings')
      .select(`
        *,
        appointment:appointments(
          time,
          day_of_week,
          max_bookings
        ),
        department:departments(name)
      `)
      .eq('appointment.doctor_id', req.user.id)
      .order('booking_date', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      bookings: data
    });
  } catch (error) {
    console.error('Get bookings error:', error);
    res.status(500).json({ error: '❌ حدث خطأ في السيرفر' });
  }
});

module.exports = router;