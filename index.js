 const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();

// ===== مهم: التحقق من متغيرات البيئة =====
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ SUPABASE_URL أو SUPABASE_KEY غير موجودة في متغيرات البيئة!');
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ===== Middleware =====
app.use(cors());
app.use(express.json());

// ===== Test Route =====
app.get('/', (req, res) => {
  res.json({ 
    message: '🚀 Clinic API is running!',
    supabase_connected: !!supabaseUrl && !!supabaseKey
  });
});

// ===== Health Check =====
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    supabase: supabaseUrl ? 'Configured ✅' : 'Missing ❌'
  });
});

// ============================
// 1. الأقسام (Departments)
// ============================

// جلب كل الأقسام
app.get('/api/departments', async (req, res) => {
  try {
    console.log('📡 GET /api/departments');
    const { data, error } = await supabase
      .from('departments')
      .select('*')
      .order('created_at', { ascending: true });
    
    if (error) {
      console.error('❌ Supabase error:', error);
      return res.status(500).json({ error: error.message });
    }
    
    console.log('✅ Found', data?.length || 0, 'departments');
    res.json(data || []);
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// إضافة قسم جديد (أدمن)
app.post('/api/departments', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'اسم القسم مطلوب' });
    }
    
    const { data, error } = await supabase
      .from('departments')
      .insert([{ name }])
      .select();
    
    if (error) {
      console.error('❌ Supabase error:', error);
      return res.status(500).json({ error: error.message });
    }
    
    res.status(201).json(data[0]);
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// تحديث قسم (أدمن)
app.put('/api/departments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    
    const { data, error } = await supabase
      .from('departments')
      .update({ name })
      .eq('id', id)
      .select();
    
    if (error) {
      console.error('❌ Supabase error:', error);
      return res.status(500).json({ error: error.message });
    }
    if (data.length === 0) {
      return res.status(404).json({ error: 'القسم غير موجود' });
    }
    
    res.json(data[0]);
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// حذف قسم (أدمن)
app.delete('/api/departments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { error } = await supabase
      .from('departments')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('❌ Supabase error:', error);
      return res.status(500).json({ error: error.message });
    }
    
    res.json({ message: 'تم حذف القسم بنجاح' });
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============================
// 2. الأطباء (Doctors)
// ============================

// جلب كل الأطباء في قسم معين
app.get('/api/doctors/department/:departmentId', async (req, res) => {
  try {
    const { departmentId } = req.params;
    
    const { data, error } = await supabase
      .from('doctors')
      .select('*')
      .eq('department_id', departmentId);
    
    if (error) {
      console.error('❌ Supabase error:', error);
      return res.status(500).json({ error: error.message });
    }
    
    res.json(data || []);
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// جلب طبيب بنوع معين من قسم
app.get('/api/doctors/department/:departmentId/type/:type', async (req, res) => {
  try {
    const { departmentId, type } = req.params;
    
    const { data, error } = await supabase
      .from('doctors')
      .select('*')
      .eq('department_id', departmentId)
      .eq('type', type);
    
    if (error) {
      console.error('❌ Supabase error:', error);
      return res.status(500).json({ error: error.message });
    }
    
    res.json(data || []);
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// إضافة طبيب جديد (أدمن)
app.post('/api/doctors', async (req, res) => {
  try {
    const { department_id, type } = req.body;
    
    if (!department_id || !type) {
      return res.status(400).json({ error: 'القسم والنوع مطلوبان' });
    }
    
    if (!['male', 'female', 'both'].includes(type)) {
      return res.status(400).json({ error: 'النوع يجب أن يكون male أو female أو both' });
    }
    
    // التحقق من وجود طبيب من نفس النوع
    const { data: existing } = await supabase
      .from('doctors')
      .select('*')
      .eq('department_id', department_id)
      .eq('type', type);
    
    if (existing && existing.length > 0) {
      const typeName = type === 'male' ? 'دكتور' : type === 'female' ? 'دكتورة' : 'الاتنين معاً';
      return res.status(400).json({ error: `يوجد بالفعل ${typeName} في هذا القسم` });
    }
    
    // لو 'both' نضيف دكتور ودكتورة
    if (type === 'both') {
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
        return res.status(400).json({ error: 'يوجد بالفعل دكتور في هذا القسم' });
      }
      if (femaleExists && femaleExists.length > 0) {
        return res.status(400).json({ error: 'يوجد بالفعل دكتورة في هذا القسم' });
      }
      
      const { data: doctors, error } = await supabase
        .from('doctors')
        .insert([
          { department_id, type: 'male' },
          { department_id, type: 'female' }
        ])
        .select();
      
      if (error) {
        console.error('❌ Supabase error:', error);
        return res.status(500).json({ error: error.message });
      }
      return res.status(201).json(doctors);
    }
    
    // إضافة نوع واحد
    const { data, error } = await supabase
      .from('doctors')
      .insert([{ department_id, type }])
      .select();
    
    if (error) {
      console.error('❌ Supabase error:', error);
      return res.status(500).json({ error: error.message });
    }
    
    res.status(201).json(data[0]);
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// حذف طبيب (أدمن)
app.delete('/api/doctors/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { error } = await supabase
      .from('doctors')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('❌ Supabase error:', error);
      return res.status(500).json({ error: error.message });
    }
    
    res.json({ message: 'تم حذف الطبيب بنجاح' });
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============================
// 3. المواعيد (Time Slots)
// ============================

// جلب مواعيد طبيب في تاريخ معين
app.get('/api/slots/doctor/:doctorId', async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { date } = req.query;
    
    if (!date) {
      return res.status(400).json({ error: 'التاريخ مطلوب' });
    }
    
    const { data, error } = await supabase
      .from('time_slots')
      .select('*')
      .eq('doctor_id', doctorId)
      .eq('date', date)
      .order('start_time', { ascending: true });
    
    if (error) {
      console.error('❌ Supabase error:', error);
      return res.status(500).json({ error: error.message });
    }
    
    res.json(data || []);
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// جلب المواعيد المتاحة فقط
app.get('/api/slots/available/doctor/:doctorId', async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { date } = req.query;
    
    if (!date) {
      return res.status(400).json({ error: 'التاريخ مطلوب' });
    }
    
    const { data, error } = await supabase
      .from('time_slots')
      .select('*')
      .eq('doctor_id', doctorId)
      .eq('date', date)
      .lt('current_bookings', supabase.raw('max_bookings'))
      .order('start_time', { ascending: true });
    
    if (error) {
      console.error('❌ Supabase error:', error);
      return res.status(500).json({ error: error.message });
    }
    
    res.json(data || []);
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// إضافة موعد جديد (أدمن)
app.post('/api/slots', async (req, res) => {
  try {
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
    
    if (error) {
      console.error('❌ Supabase error:', error);
      return res.status(500).json({ error: error.message });
    }
    
    res.status(201).json(data[0]);
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// تحديث موعد (أدمن)
app.put('/api/slots/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { start_time, end_time, max_bookings } = req.body;
    
    const { data, error } = await supabase
      .from('time_slots')
      .update({ start_time, end_time, max_bookings })
      .eq('id', id)
      .select();
    
    if (error) {
      console.error('❌ Supabase error:', error);
      return res.status(500).json({ error: error.message });
    }
    if (data.length === 0) {
      return res.status(404).json({ error: 'الموعد غير موجود' });
    }
    
    res.json(data[0]);
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// حذف موعد (أدمن)
app.delete('/api/slots/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { error } = await supabase
      .from('time_slots')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('❌ Supabase error:', error);
      return res.status(500).json({ error: error.message });
    }
    
    res.json({ message: 'تم حذف الموعد بنجاح' });
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============================
// 4. الحجوزات (Bookings)
// ============================

// إنشاء حجز جديد
app.post('/api/bookings', async (req, res) => {
  try {
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
      console.error('❌ Supabase error:', bookingError);
      return res.status(500).json({ error: bookingError.message });
    }
    
    // تحديث عدد الحجوزات
    await supabase
      .from('time_slots')
      .update({ current_bookings: slotData.current_bookings + 1 })
      .eq('id', slot_id);
    
    res.status(201).json(booking[0]);
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// جلب كل الحجوزات (للأدمن)
app.get('/api/bookings/all', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .order('booking_date', { ascending: false });
    
    if (error) {
      console.error('❌ Supabase error:', error);
      return res.status(500).json({ error: error.message });
    }
    
    res.json(data || []);
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// جلب حجوزات طبيب معين
app.get('/api/bookings/doctor/:doctorId', async (req, res) => {
  try {
    const { doctorId } = req.params;
    
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('doctor_id', doctorId)
      .order('booking_date', { ascending: false });
    
    if (error) {
      console.error('❌ Supabase error:', error);
      return res.status(500).json({ error: error.message });
    }
    
    res.json(data || []);
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// جلب حجوزات قسم معين
app.get('/api/bookings/department/:departmentId', async (req, res) => {
  try {
    const { departmentId } = req.params;
    
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('department_id', departmentId)
      .order('booking_date', { ascending: false });
    
    if (error) {
      console.error('❌ Supabase error:', error);
      return res.status(500).json({ error: error.message });
    }
    
    res.json(data || []);
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// إلغاء حجز
app.delete('/api/bookings/:id', async (req, res) => {
  try {
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
      console.error('❌ Supabase error:', deleteError);
      return res.status(500).json({ error: deleteError.message });
    }
    
    // تحديث عدد الحجوزات
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
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============================
// 5. تسجيل الدخول (Admin)
// ============================

app.post('/api/admin/login', async (req, res) => {
  try {
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
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============================
// تشغيل الخادم
// ============================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Supabase: ${supabaseUrl ? '✅ Connected' : '❌ Not connected'}`);
});

// للتوافق مع Vercel (export الخادم)
module.exports = app;