 const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();

// ===== التحقق من متغيرات البيئة =====
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const jwtSecret = process.env.JWT_SECRET;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ SUPABASE_URL أو SUPABASE_KEY غير موجودة!');
}
if (!jwtSecret) {
  console.error('❌ JWT_SECRET غير موجودة!');
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ===== Middleware =====
app.use(cors());
app.use(express.json());

// ===== Test Route =====
app.get('/', (req, res) => {
  res.json({
    message: '🚀 Clinic API is running!',
    supabase_connected: !!supabaseUrl && !!supabaseKey,
    version: '4.0.0'
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

// ===== Middleware: التحقق من Token =====
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ error: 'لم يتم توفير التوكن' });
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'تنسيق التوكن غير صحيح' });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'توكن غير صالح أو منتهي الصلاحية' });
  }
};

// ============================
// 1. تسجيل الدخول (Admin Login)
// ============================

/**
 * POST /api/admin/login
 * تسجيل دخول الأدمن وإرجاع Token
 */
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

    const token = jwt.sign(
      { id: data.id, email: data.email, role: 'admin' },
      jwtSecret,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'تم تسجيل الدخول بنجاح',
      token: token,
      admin: { id: data.id, email: data.email }
    });
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============================
// 2. الأقسام (للمريض)
// ============================

/**
 * GET /api/departments
 * جلب كل الأقسام
 */
app.get('/api/departments', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('departments')
      .select('*')
      .order('order', { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

/**
 * GET /api/departments/:id
 * جلب تفاصيل قسم معين (مع أنواع الأطباء)
 */
app.get('/api/departments/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: department, error: deptError } = await supabase
      .from('departments')
      .select('*')
      .eq('id', id)
      .single();

    if (deptError || !department) {
      return res.status(404).json({ error: 'القسم غير موجود' });
    }

    const { data: doctorTypes, error: typesError } = await supabase
      .from('doctor_types')
      .select('*')
      .eq('department_id', id)
      .eq('enabled', true);

    if (typesError) throw typesError;

    department.doctor_types = doctorTypes || [];
    res.json(department);
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============================
// 3. الفترات (للمريض) - مع حساب current_bookings
// ============================

/**
 * GET /api/slots
 * جلب الفترات المتاحة لدكتور في يوم معين مع حساب current_bookings
 * query: doctor_type_id, date
 */
app.get('/api/slots', async (req, res) => {
  try {
    const { doctor_type_id, date } = req.query;

    if (!doctor_type_id || !date) {
      return res.status(400).json({ error: 'doctor_type_id و date مطلوبان' });
    }

    // ✅ 1. جلب الفترات من جدول slots
    const { data: slots, error: slotsError } = await supabase
      .from('slots')
      .select('*')
      .eq('doctor_type_id', doctor_type_id)
      .eq('date', date)
      .order('from_time', { ascending: true });

    if (slotsError) throw slotsError;

    if (!slots || slots.length === 0) {
      return res.json([]);
    }

    // ✅ 2. حساب current_bookings لكل فترة من جدول bookings
    const slotsWithBookings = await Promise.all(slots.map(async (slot) => {
      const { data: bookings, error: countError, count } = await supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('slot_id', slot.id);

      if (countError) throw countError;

      const currentBookings = count || 0;

      return {
        id: slot.id,
        date: slot.date,
        from_time: slot.from_time,
        to_time: slot.to_time,
        capacity: slot.capacity,
        current_bookings: currentBookings,
        remaining: slot.capacity - currentBookings,
        available: currentBookings < slot.capacity,
        time_range: `${slot.from_time.substring(0, 5)} - ${slot.to_time.substring(0, 5)}`
      };
    }));

    res.json(slotsWithBookings);
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============================
// 4. الحجوزات (للمريض)
// ============================

/**
 * POST /api/bookings
 * إنشاء حجز جديد
 */
app.post('/api/bookings', async (req, res) => {
  try {
    const {
      slot_id,
      patient_name,
      patient_age,
      patient_phone,
      patient_gender
    } = req.body;

    // ✅ التحقق من جميع الحقول
    if (!slot_id || !patient_name || !patient_age || !patient_phone || !patient_gender) {
      return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
    }

    // ✅ التحقق من صحة الجنس
    if (!['male', 'female'].includes(patient_gender)) {
      return res.status(400).json({ error: 'الجنس يجب أن يكون male أو female' });
    }

    // ✅ التحقق من عدم وجود رقم تليفون مكرر
    const { data: existingPhone, error: phoneError } = await supabase
      .from('bookings')
      .select('id, patient_phone, patient_name')
      .eq('patient_phone', patient_phone)
      .maybeSingle();

    if (phoneError) throw phoneError;

    if (existingPhone) {
      return res.status(400).json({ 
        error: 'رقم التليفون مستخدم بالفعل في حجز آخر',
        existing_booking: {
          id: existingPhone.id,
          patient_name: existingPhone.patient_name
        }
      });
    }

    // ✅ التحقق من وجود الفترة
    const { data: slot, error: slotError } = await supabase
      .from('slots')
      .select('id, capacity')
      .eq('id', slot_id)
      .single();

    if (slotError || !slot) {
      return res.status(404).json({ error: 'الموعد غير موجود' });
    }

    // ✅ التحقق من السعة
    const { data: currentBookings, error: countError, count } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('slot_id', slot_id);

    if (countError) throw countError;

    const currentCount = count || 0;

    if (currentCount >= slot.capacity) {
      return res.status(400).json({ 
        error: 'الموعد مكتمل، لا توجد أماكن متاحة',
        capacity: slot.capacity,
        current_bookings: currentCount,
        remaining: 0
      });
    }

    // ✅ إنشاء الحجز
    const bookingData = {
      slot_id,
      patient_name,
      patient_age,
      patient_phone,
      patient_gender,
      created_at: new Date(),
      updated_at: new Date()
    };

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert([bookingData])
      .select()
      .single();

    if (bookingError) throw bookingError;

    // ✅ حساب العدد الجديد
    const newCount = currentCount + 1;

    res.status(201).json({
      ...booking,
      capacity: slot.capacity,
      current_bookings: newCount,
      remaining: slot.capacity - newCount
    });
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============================
// 5. إدارة الأدمن
// ============================

/**
 * GET /api/admin/slots
 * جلب كل الفترات مع current_bookings (للأدمن)
 */
app.get('/api/admin/slots', verifyToken, async (req, res) => {
  try {
    const { data: slots, error: slotsError } = await supabase
      .from('slots')
      .select(`
        *,
        doctor_types:doctor_type_id(
          id,
          type,
          label,
          departments:department_id(name)
        )
      `)
      .order('date', { ascending: false });

    if (slotsError) throw slotsError;

    // ✅ حساب current_bookings لكل فترة
    const slotsWithBookings = await Promise.all((slots || []).map(async (slot) => {
      const { data: bookings, error: countError, count } = await supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('slot_id', slot.id);

      if (countError) throw countError;

      const currentBookings = count || 0;

      return {
        ...slot,
        current_bookings: currentBookings,
        remaining: slot.capacity - currentBookings
      };
    }));

    res.json(slotsWithBookings);
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

/**
 * POST /api/admin/slots
 * إضافة فترة جديدة (للأدمن)
 */
app.post('/api/admin/slots', verifyToken, async (req, res) => {
  try {
    const { doctor_type_id, date, from_time, to_time, capacity } = req.body;

    if (!doctor_type_id || !date || !from_time || !to_time || !capacity) {
      return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
    }

    const { data, error } = await supabase
      .from('slots')
      .insert([{
        doctor_type_id,
        date,
        from_time,
        to_time,
        capacity,
        created_at: new Date(),
        updated_at: new Date()
      }])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(data);
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

/**
 * PUT /api/admin/slots/:id
 * تعديل فترة (للأدمن)
 */
app.put('/api/admin/slots/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { date, from_time, to_time, capacity } = req.body;

    const updateData = {};
    if (date) updateData.date = date;
    if (from_time) updateData.from_time = from_time;
    if (to_time) updateData.to_time = to_time;
    if (capacity) updateData.capacity = capacity;
    updateData.updated_at = new Date();

    const { data, error } = await supabase
      .from('slots')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'الفترة غير موجودة' });

    res.json(data);
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

/**
 * DELETE /api/admin/slots/:id
 * حذف فترة (للأدمن)
 */
app.delete('/api/admin/slots/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    // التحقق من وجود حجوزات في هذه الفترة
    const { data: bookings, error: countError, count } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('slot_id', id);

    if (countError) throw countError;

    if (count > 0) {
      return res.status(400).json({ 
        error: 'لا يمكن حذف الفترة لأنها تحتوي على حجوزات',
        bookings_count: count
      });
    }

    const { error } = await supabase
      .from('slots')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ message: 'تم حذف الفترة بنجاح' });
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

/**
 * GET /api/admin/bookings
 * جلب كل الحجوزات (للأدمن)
 */
app.get('/api/admin/bookings', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('bookings')
      .select(`
        *,
        slots:slot_id(
          id,
          date,
          from_time,
          to_time,
          capacity,
          doctor_types:doctor_type_id(
            id,
            type,
            label,
            departments:department_id(name)
          )
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // ✅ حساب current_bookings لكل حجز
    const bookingsWithCounts = await Promise.all((data || []).map(async (booking) => {
      let currentBookings = 0;
      if (booking.slots?.id) {
        const { data: countData, error: countError, count } = await supabase
          .from('bookings')
          .select('id', { count: 'exact', head: true })
          .eq('slot_id', booking.slots.id);
        
        if (!countError) {
          currentBookings = count || 0;
        }
      }

      return {
        ...booking,
        slot_current_bookings: currentBookings,
        slot_remaining: (booking.slots?.capacity || 0) - currentBookings
      };
    }));

    res.json(bookingsWithCounts);
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

/**
 * DELETE /api/admin/bookings/:id
 * إلغاء حجز (للأدمن)
 */
app.delete('/api/admin/bookings/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('bookings')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ message: 'تم إلغاء الحجز بنجاح' });
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

/**
 * GET /api/admin/departments
 * جلب كل الأقسام مع التفاصيل (للأدمن)
 */
app.get('/api/admin/departments', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('departments')
      .select(`
        *,
        doctor_types:doctor_types(*)
      `)
      .order('order', { ascending: true });

    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

/**
 * POST /api/admin/departments
 * إضافة قسم جديد (للأدمن)
 */
app.post('/api/admin/departments', verifyToken, async (req, res) => {
  try {
    const { name, icon_url } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'اسم القسم مطلوب' });
    }

    const { data: maxOrder } = await supabase
      .from('departments')
      .select('order')
      .order('order', { ascending: false })
      .limit(1);

    const nextOrder = (maxOrder && maxOrder.length > 0) ? maxOrder[0].order + 1 : 1;

    const { data, error } = await supabase
      .from('departments')
      .insert([{
        name,
        icon_url: icon_url || null,
        order: nextOrder,
        created_at: new Date(),
        updated_at: new Date()
      }])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(data);
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

/**
 * PUT /api/admin/departments/:id
 * تعديل قسم (للأدمن)
 */
app.put('/api/admin/departments/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, icon_url } = req.body;

    const updateData = {};
    if (name) updateData.name = name;
    if (icon_url !== undefined) updateData.icon_url = icon_url;
    updateData.updated_at = new Date();

    const { data, error } = await supabase
      .from('departments')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'القسم غير موجود' });

    res.json(data);
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

/**
 * DELETE /api/admin/departments/:id
 * حذف قسم (للأدمن)
 */
app.delete('/api/admin/departments/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('departments')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ message: 'تم حذف القسم بنجاح' });
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

/**
 * POST /api/admin/doctor-types
 * إضافة نوع طبيب (للأدمن)
 */
app.post('/api/admin/doctor-types', verifyToken, async (req, res) => {
  try {
    const { department_id, type, label } = req.body;

    if (!department_id || !type || !label) {
      return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
    }

    if (!['male', 'female'].includes(type)) {
      return res.status(400).json({ error: 'type يجب أن يكون male أو female' });
    }

    const { data, error } = await supabase
      .from('doctor_types')
      .insert([{
        department_id,
        type,
        label,
        enabled: true,
        created_at: new Date(),
        updated_at: new Date()
      }])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(data);
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============================
// 6. تشغيل الخادم
// ============================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Supabase: ${supabaseUrl ? '✅ Connected' : '❌ Not connected'}`);
  console.log(`🔐 JWT: ${jwtSecret ? '✅ Configured' : '❌ Missing'}`);
  console.log(`📦 Version: 4.0.0 (نظام حجز جديد مع حساب current_bookings)`);
});

module.exports = app;