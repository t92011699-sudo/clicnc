 const express = require('express');
const cors = require('cors');
const supabase = require('./supabase');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// ============================
// 1. الأقسام (Departments)
// ============================

// جلب كل الأقسام
app.get('/api/departments', async (req, res) => {
  const { data, error } = await supabase
    .from('departments')
    .select('*')
    .order('created_at', { ascending: true });
  
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// إضافة قسم جديد (أدمن)
app.post('/api/departments', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'اسم القسم مطلوب' });
  
  const { data, error } = await supabase
    .from('departments')
    .insert([{ name }])
    .select();
  
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data[0]);
});

// تحديث قسم (أدمن)
app.put('/api/departments/:id', async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  
  const { data, error } = await supabase
    .from('departments')
    .update({ name })
    .eq('id', id)
    .select();
  
  if (error) return res.status(500).json({ error: error.message });
  if (data.length === 0) return res.status(404).json({ error: 'القسم غير موجود' });
  res.json(data[0]);
});

// حذف قسم (أدمن)
app.delete('/api/departments/:id', async (req, res) => {
  const { id } = req.params;
  
  const { error } = await supabase
    .from('departments')
    .delete()
    .eq('id', id);
  
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'تم حذف القسم بنجاح' });
});

// ============================
// 2. الأطباء (Doctors)
// ============================

// جلب كل الأطباء في قسم معين (للمريض)
app.get('/api/doctors/department/:departmentId', async (req, res) => {
  const { departmentId } = req.params;
  
  const { data, error } = await supabase
    .from('doctors')
    .select('*')
    .eq('department_id', departmentId);
  
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// جلب دكتور معين من قسم (دكتور أو دكتورة)
app.get('/api/doctors/department/:departmentId/type/:type', async (req, res) => {
  const { departmentId, type } = req.params;
  
  const { data, error } = await supabase
    .from('doctors')
    .select('*')
    .eq('department_id', departmentId)
    .eq('type', type);
  
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// إضافة طبيب جديد (أدمن) - من غير اسم
app.post('/api/doctors', async (req, res) => {
  const { department_id, type } = req.body;
  
  if (!department_id || !type) {
    return res.status(400).json({ error: 'القسم والنوع مطلوبان' });
  }
  
  // التأكد من صحة النوع
  if (!['male', 'female', 'both'].includes(type)) {
    return res.status(400).json({ error: 'النوع يجب أن يكون male أو female أو both' });
  }
  
  // التأكد من وجود طبيب واحد فقط من كل نوع في القسم
  const { data: existing } = await supabase
    .from('doctors')
    .select('*')
    .eq('department_id', department_id)
    .eq('type', type);
  
  if (existing && existing.length > 0) {
    const typeName = type === 'male' ? 'دكتور' : type === 'female' ? 'دكتورة' : 'الاتنين معاً';
    return res.status(400).json({ error: `يوجد بالفعل ${typeName} في هذا القسم` });
  }
  
  // إذا كان النوع 'both' نضيف دكتور ودكتورة معاً
  if (type === 'both') {
    // التحقق من عدم وجود دكتور أو دكتورة منفردين
    const { data: maleExists } = await supabase
      .from('doctors')
      .select('*')
      .eq('department_id', department_id)
      .eq('type', 'male');
    
    const { data: femaleExists } = await supabase
      .from('doctors')
      .select('*')
      .eq('department_id', department_id)
      .eq('type', 'female');
    
    if (maleExists && maleExists.length > 0) {
      return res.status(400).json({ error: 'يوجد بالفعل دكتور في هذا القسم، لا يمكن إضافة both' });
    }
    if (femaleExists && femaleExists.length > 0) {
      return res.status(400).json({ error: 'يوجد بالفعل دكتورة في هذا القسم، لا يمكن إضافة both' });
    }
    
    // إضافة دكتور ودكتورة معاً
    const { data: doctors, error } = await supabase
      .from('doctors')
      .insert([
        { department_id, type: 'male' },
        { department_id, type: 'female' }
      ])
      .select();
    
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(doctors);
  }
  
  // إضافة نوع واحد (male أو female)
  const { data, error } = await supabase
    .from('doctors')
    .insert([{ department_id, type }])
    .select();
  
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data[0]);
});

// حذف طبيب (أدمن)
app.delete('/api/doctors/:id', async (req, res) => {
  const { id } = req.params;
  
  const { error } = await supabase
    .from('doctors')
    .delete()
    .eq('id', id);
  
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'تم حذف الطبيب بنجاح' });
});

// ============================
// 3. المواعيد (Time Slots)
// ============================

// جلب مواعيد طبيب في تاريخ معين (للمريض)
app.get('/api/slots/doctor/:doctorId', async (req, res) => {
  const { doctorId } = req.params;
  const { date } = req.query;
  
  if (!date) return res.status(400).json({ error: 'التاريخ مطلوب' });
  
  const { data, error } = await supabase
    .from('time_slots')
    .select('*')
    .eq('doctor_id', doctorId)
    .eq('date', date)
    .order('start_time', { ascending: true });
  
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// جلب المواعيد المتاحة فقط (للمريض)
app.get('/api/slots/available/doctor/:doctorId', async (req, res) => {
  const { doctorId } = req.params;
  const { date } = req.query;
  
  if (!date) return res.status(400).json({ error: 'التاريخ مطلوب' });
  
  const { data, error } = await supabase
    .from('time_slots')
    .select('*')
    .eq('doctor_id', doctorId)
    .eq('date', date)
    .lt('current_bookings', supabase.raw('max_bookings'))
    .order('start_time', { ascending: true });
  
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// جلب كل مواعيد قسم في تاريخ معين
app.get('/api/slots/department/:departmentId', async (req, res) => {
  const { departmentId } = req.params;
  const { date } = req.query;
  
  if (!date) return res.status(400).json({ error: 'التاريخ مطلوب' });
  
  // جلب كل الأطباء في القسم
  const { data: doctors } = await supabase
    .from('doctors')
    .select('id')
    .eq('department_id', departmentId);
  
  if (!doctors || doctors.length === 0) {
    return res.json([]);
  }
  
  const doctorIds = doctors.map(d => d.id);
  
  const { data, error } = await supabase
    .from('time_slots')
    .select('*, doctors(type)')
    .in('doctor_id', doctorIds)
    .eq('date', date)
    .order('start_time', { ascending: true });
  
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// إضافة موعد جديد (أدمن)
app.post('/api/slots', async (req, res) => {
  const { doctor_id, date, start_time, end_time, max_bookings } = req.body;
  
  if (!doctor_id || !date || !start_time || !end_time) {
    return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
  }
  
  const { data, error } = await supabase
    .from('time_slots')
    .insert([{ 
      doctor_id, 
      date, 
      start_time, 
      end_time,
      max_bookings: max_bookings || 1,
      current_bookings: 0
    }])
    .select();
  
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data[0]);
});

// تحديث موعد (أدمن)
app.put('/api/slots/:id', async (req, res) => {
  const { id } = req.params;
  const { start_time, end_time, max_bookings } = req.body;
  
  const { data, error } = await supabase
    .from('time_slots')
    .update({ start_time, end_time, max_bookings })
    .eq('id', id)
    .select();
  
  if (error) return res.status(500).json({ error: error.message });
  if (data.length === 0) return res.status(404).json({ error: 'الموعد غير موجود' });
  res.json(data[0]);
});

// حذف موعد (أدمن)
app.delete('/api/slots/:id', async (req, res) => {
  const { id } = req.params;
  
  const { error } = await supabase
    .from('time_slots')
    .delete()
    .eq('id', id);
  
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'تم حذف الموعد بنجاح' });
});

// ============================
// 4. الحجوزات (Bookings)
// ============================

// إنشاء حجز جديد (المريض)
app.post('/api/bookings', async (req, res) => {
  const { doctor_id, department_id, slot_id, patient_name, patient_age, patient_phone, booking_date } = req.body;
  
  if (!doctor_id || !department_id || !slot_id || !patient_name || !patient_age || !patient_phone || !booking_date) {
    return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
  }
  
  // التحقق من توفر الموعد
  const { data: slotData, error: slotError } = await supabase
    .from('time_slots')
    .select('*')
    .eq('id', slot_id)
    .single();
  
  if (slotError || !slotData) {
    return res.status(404).json({ error: 'الموعد غير موجود' });
  }
  
  if (slotData.current_bookings >= slotData.max_bookings) {
    return res.status(400).json({ error: 'الموعد مكتمل، اختر موعد آخر' });
  }
  
  // إنشاء الحجز
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .insert([{ 
      doctor_id, 
      department_id, 
      slot_id, 
      patient_name, 
      patient_age, 
      patient_phone, 
      booking_date 
    }])
    .select();
  
  if (bookingError) {
    return res.status(500).json({ error: bookingError.message });
  }
  
  // تحديث عدد الحجوزات في الموعد
  await supabase
    .from('time_slots')
    .update({ current_bookings: slotData.current_bookings + 1 })
    .eq('id', slot_id);
  
  res.status(201).json(booking[0]);
});

// جلب حجوزات طبيب معين (للأدمن)
app.get('/api/bookings/doctor/:doctorId', async (req, res) => {
  const { doctorId } = req.params;
  
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('doctor_id', doctorId)
    .order('booking_date', { ascending: false });
  
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// جلب حجوزات قسم معين (للأدمن)
app.get('/api/bookings/department/:departmentId', async (req, res) => {
  const { departmentId } = req.params;
  
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('department_id', departmentId)
    .order('booking_date', { ascending: false });
  
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// جلب كل الحجوزات (للأدمن)
app.get('/api/bookings/all', async (req, res) => {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .order('booking_date', { ascending: false });
  
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// إلغاء حجز
app.delete('/api/bookings/:id', async (req, res) => {
  const { id } = req.params;
  
  // جلب الحجز قبل الحذف
  const { data: booking, error: fetchError } = await supabase
    .from('bookings')
    .select('slot_id')
    .eq('id', id)
    .single();
  
  if (fetchError) {
    return res.status(404).json({ error: 'الحجز غير موجود' });
  }
  
  // حذف الحجز
  const { error: deleteError } = await supabase
    .from('bookings')
    .delete()
    .eq('id', id);
  
  if (deleteError) {
    return res.status(500).json({ error: deleteError.message });
  }
  
  // تحديث عدد الحجوزات في الموعد
  const { data: slotData } = await supabase
    .from('time_slots')
    .select('current_bookings')
    .eq('id', booking.slot_id)
    .single();
  
  if (slotData) {
    await supabase
      .from('time_slots')
      .update({ current_bookings: Math.max(0, slotData.current_bookings - 1) })
      .eq('id', booking.slot_id);
  }
  
  res.json({ message: 'تم إلغاء الحجز بنجاح' });
});

// ============================
// 5. تسجيل الدخول (Admin)
// ============================

app.post('/api/admin/login', async (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'البريد الإلكتروني وكلمة المرور مطلوبان' });
  }
  
  const { data, error } = await supabase
    .from('admins')
    .select('*')
    .eq('email', email)
    .eq('password', password)
    .single();
  
  if (error || !data) {
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  }
  
  res.json({ 
    success: true, 
    message: 'تم تسجيل الدخول بنجاح',
    admin: { email: data.email }
  });
});

// ============================
// 6. تشغيل الخادم
// ============================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});