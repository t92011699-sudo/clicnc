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
    version: '3.0.0'
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
// 1. تسجيل الدخول (Admin Login) مع Token
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

    // ✅ إنشاء Token
    const token = jwt.sign(
      { 
        id: data.id, 
        email: data.email,
        role: 'admin'
      },
      jwtSecret,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'تم تسجيل الدخول بنجاح',
      token: token,
      admin: {
        id: data.id,
        email: data.email
      }
    });
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============================
// 2. الأقسام (Departments)
// ============================

/**
 * GET /api/departments
 * جلب كل الأقسام
 */
app.get('/api/departments', async (req, res) => {
  try {
    console.log('📡 GET /api/departments');
    
    const { data: departments, error: deptError } = await supabase
      .from('departments')
      .select('*')
      .order('order', { ascending: true });

    if (deptError) {
      console.error('❌ Supabase error:', deptError);
      return res.status(500).json({ error: deptError.message });
    }

    const { data: doctorTypes, error: typesError } = await supabase
      .from('doctor_types')
      .select(`
        *,
        custom_slots:custom_slots(*)
      `)
      .eq('enabled', true);

    if (typesError) {
      console.error('❌ Types error:', typesError);
      return res.status(500).json({ error: typesError.message });
    }

    const result = departments.map(dept => {
      const types = doctorTypes.filter(dt => dt.department_id === dept.id);
      return {
        ...dept,
        doctor_types: types
      };
    });

    console.log('✅ Found', result?.length || 0, 'departments');
    res.json(result || []);
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

/**
 * GET /api/departments/:id
 * جلب تفاصيل قسم معين
 */
app.get('/api/departments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('📡 GET /api/departments/:id', id);

    const { data: department, error: deptError } = await supabase
      .from('departments')
      .select('*')
      .eq('id', id)
      .single();

    if (deptError || !department) {
      console.error('❌ Department not found:', deptError);
      return res.status(404).json({ error: 'القسم غير موجود' });
    }

    const { data: doctorTypes, error: typesError } = await supabase
      .from('doctor_types')
      .select(`
        *,
        custom_slots:custom_slots(
          id,
          date,
          capacity,
          from_time,
          to_time
        )
      `)
      .eq('department_id', id)
      .order('type', { ascending: true });

    if (typesError) {
      console.error('❌ Types error:', typesError);
      return res.status(500).json({ error: typesError.message });
    }

    department.doctor_types = doctorTypes || [];
    
    console.log('✅ Department found:', department.name);
    console.log('✅ Doctor types:', doctorTypes?.length || 0);
    
    res.json(department);
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

/**
 * POST /api/departments
 * إضافة قسم جديد
 */
app.post('/api/departments', async (req, res) => {
  try {
    const { name, icon_url, doctor_types } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'اسم القسم مطلوب' });
    }

    const { data: maxOrder } = await supabase
      .from('departments')
      .select('order')
      .order('order', { ascending: false })
      .limit(1);

    const nextOrder = (maxOrder && maxOrder.length > 0) ? maxOrder[0].order + 1 : 1;

    const { data: department, error: deptError } = await supabase
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

    if (deptError) {
      console.error('❌ Supabase error:', deptError);
      return res.status(500).json({ error: deptError.message });
    }

    let addedTypes = [];
    if (doctor_types && Array.isArray(doctor_types) && doctor_types.length > 0) {
      const typesToInsert = doctor_types.map(type => ({
        department_id: department.id,
        type: type.type,
        label: type.label || (type.type === 'male' ? 'دكتور' : 'دكتورة'),
        enabled: type.enabled !== undefined ? type.enabled : true,
        created_at: new Date(),
        updated_at: new Date()
      }));

      const { data: types, error: typesError } = await supabase
        .from('doctor_types')
        .insert(typesToInsert)
        .select();

      if (typesError) {
        console.error('❌ Types error:', typesError);
        await supabase.from('departments').delete().eq('id', department.id);
        return res.status(500).json({ error: typesError.message });
      }

      addedTypes = types;
    }

    res.status(201).json({
      ...department,
      doctor_types: addedTypes
    });
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

/**
 * PUT /api/departments/:id
 * تعديل بيانات القسم
 */
app.put('/api/departments/:id', async (req, res) => {
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

    if (error) {
      console.error('❌ Supabase error:', error);
      return res.status(500).json({ error: error.message });
    }
    if (!data) {
      return res.status(404).json({ error: 'القسم غير موجود' });
    }

    res.json(data);
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

/**
 * DELETE /api/departments/:id
 * حذف قسم
 */
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

/**
 * PUT /api/departments/reorder
 * إعادة ترتيب الأقسام
 */
app.put('/api/departments/reorder', async (req, res) => {
  try {
    const { ordered_ids } = req.body;

    if (!ordered_ids || !Array.isArray(ordered_ids)) {
      return res.status(400).json({ error: 'ordered_ids مطلوب كمصفوفة' });
    }

    for (let i = 0; i < ordered_ids.length; i++) {
      const { error } = await supabase
        .from('departments')
        .update({ order: i + 1, updated_at: new Date() })
        .eq('id', ordered_ids[i]);

      if (error) throw error;
    }

    res.json({ message: 'تم إعادة ترتيب الأقسام بنجاح' });
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============================
// 3. أنواع الأطباء (Doctor Types)
// ============================

/**
 * PUT /api/departments/:id/doctor-types
 * تحديث أنواع الأطباء
 */
app.put('/api/departments/:id/doctor-types', async (req, res) => {
  try {
    const { id } = req.params;
    const { doctor_types } = req.body;

    if (!doctor_types || !Array.isArray(doctor_types)) {
      return res.status(400).json({ error: 'doctor_types مطلوب كمصفوفة' });
    }

    for (const type of doctor_types) {
      const { error } = await supabase
        .from('doctor_types')
        .upsert({
          department_id: id,
          type: type.type,
          label: type.label || (type.type === 'male' ? 'دكتور' : 'دكتورة'),
          enabled: type.enabled !== undefined ? type.enabled : true,
          updated_at: new Date()
        }, {
          onConflict: 'department_id,type'
        });

      if (error) throw error;
    }

    const { data, error } = await supabase
      .from('doctor_types')
      .select('*')
      .eq('department_id', id);

    if (error) throw error;

    res.json({
      department_id: id,
      doctor_types: data
    });
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============================
// 4. الفترات المخصصة (Custom Slots)
// ============================

/**
 * GET /api/departments/:departmentId/doctor-types/:type/custom-slots
 * جلب الفترات المخصصة
 */
app.get('/api/departments/:departmentId/doctor-types/:type/custom-slots', async (req, res) => {
  try {
    const { departmentId, type } = req.params;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ error: 'التاريخ مطلوب' });
    }

    const { data: doctorType, error: typeError } = await supabase
      .from('doctor_types')
      .select('id')
      .eq('department_id', departmentId)
      .eq('type', type)
      .single();

    if (typeError || !doctorType) {
      return res.status(404).json({ error: 'نوع الطبيب غير موجود' });
    }

    const { data, error } = await supabase
      .from('custom_slots')
      .select('*')
      .eq('doctor_type_id', doctorType.id)
      .eq('date', date);

    if (error) throw error;

    res.json({
      doctor_type: type,
      date: date,
      custom_slots: data || []
    });
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

/**
 * POST /api/departments/:departmentId/doctor-types/:type/custom-slots
 * إضافة فترة مخصصة
 */
app.post('/api/departments/:departmentId/doctor-types/:type/custom-slots', async (req, res) => {
  try {
    const { departmentId, type } = req.params;
    const { date, capacity, from_time, to_time } = req.body;

    if (!date || !capacity || !from_time || !to_time) {
      return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
    }

    const { data: doctorType, error: typeError } = await supabase
      .from('doctor_types')
      .select('id')
      .eq('department_id', departmentId)
      .eq('type', type)
      .single();

    if (typeError || !doctorType) {
      return res.status(404).json({ error: 'نوع الطبيب غير موجود' });
    }

    const { data, error } = await supabase
      .from('custom_slots')
      .insert([{
        doctor_type_id: doctorType.id,
        date,
        capacity,
        from_time,
        to_time,
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
 * PUT /api/departments/:departmentId/doctor-types/:type/custom-slots/:slotId
 * تعديل فترة مخصصة
 */
app.put('/api/departments/:departmentId/doctor-types/:type/custom-slots/:slotId', async (req, res) => {
  try {
    const { slotId } = req.params;
    const { capacity, from_time, to_time } = req.body;

    const { data, error } = await supabase
      .from('custom_slots')
      .update({
        capacity,
        from_time,
        to_time,
        updated_at: new Date()
      })
      .eq('id', slotId)
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
 * DELETE /api/departments/:departmentId/doctor-types/:type/custom-slots/:slotId
 * حذف فترة مخصصة
 */
app.delete('/api/departments/:departmentId/doctor-types/:type/custom-slots/:slotId', async (req, res) => {
  try {
    const { slotId } = req.params;

    const { error } = await supabase
      .from('custom_slots')
      .delete()
      .eq('id', slotId);

    if (error) throw error;

    res.json({ message: 'تم حذف الفترة المخصصة بنجاح' });
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============================
// 5. حفظ التعديلات (Save)
// ============================

/**
 * PUT /api/departments/:id/save
 * حفظ كل التعديلات
 */
app.put('/api/departments/:id/save', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, icon_url, doctor_types } = req.body;

    if (name || icon_url !== undefined) {
      const updateData = {};
      if (name) updateData.name = name;
      if (icon_url !== undefined) updateData.icon_url = icon_url;
      updateData.updated_at = new Date();

      const { error: deptError } = await supabase
        .from('departments')
        .update(updateData)
        .eq('id', id);

      if (deptError) throw deptError;
    }

    if (doctor_types && Array.isArray(doctor_types)) {
      for (const typeData of doctor_types) {
        let { data: doctorType, error: typeError } = await supabase
          .from('doctor_types')
          .select('id')
          .eq('department_id', id)
          .eq('type', typeData.type)
          .single();

        if (!doctorType) {
          const { data: newType, error: createError } = await supabase
            .from('doctor_types')
            .insert([{
              department_id: id,
              type: typeData.type,
              label: typeData.label || (typeData.type === 'male' ? 'دكتور' : 'دكتورة'),
              enabled: typeData.enabled !== undefined ? typeData.enabled : true,
              created_at: new Date(),
              updated_at: new Date()
            }])
            .select()
            .single();

          if (createError) throw createError;
          doctorType = newType;
        } else {
          const updateData = { updated_at: new Date() };
          if (typeData.enabled !== undefined) updateData.enabled = typeData.enabled;
          if (typeData.label) updateData.label = typeData.label;

          const { error: updateError } = await supabase
            .from('doctor_types')
            .update(updateData)
            .eq('id', doctorType.id);

          if (updateError) throw updateError;
        }

        // حذف الفترات المخصصة القديمة
        const { error: deleteCustomError } = await supabase
          .from('custom_slots')
          .delete()
          .eq('doctor_type_id', doctorType.id);

        if (deleteCustomError) throw deleteCustomError;

        // إضافة الفترات المخصصة الجديدة
        if (typeData.custom_slots && Array.isArray(typeData.custom_slots)) {
          for (const slot of typeData.custom_slots) {
            const { error: insertError } = await supabase
              .from('custom_slots')
              .insert([{
                doctor_type_id: doctorType.id,
                date: slot.date,
                capacity: slot.capacity,
                from_time: slot.from_time,
                to_time: slot.to_time,
                created_at: new Date(),
                updated_at: new Date()
              }]);

            if (insertError) throw insertError;
          }
        }
      }
    }

    const { data: updatedDepartment, error: fetchError } = await supabase
      .from('departments')
      .select(`
        *,
        doctor_types:doctor_types(
          *,
          custom_slots:custom_slots(*)
        )
      `)
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    res.json({
      success: true,
      department: updatedDepartment
    });
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============================
// 6. الحجوزات (Bookings) - مع منع تكرار رقم التليفون
// ============================

/**
 * POST /api/bookings
 * إنشاء حجز جديد (غير محمي - للمريض)
 */
app.post('/api/bookings', async (req, res) => {
  try {
    const {
      department_id,
      doctor_type,
      slot_id,
      booking_date,
      booking_time,
      patient_name,
      patient_age,
      patient_phone,
      patient_gender
    } = req.body;

    // ✅ التحقق من جميع الحقول
    if (!department_id || !doctor_type || !slot_id || !booking_date || !booking_time || !patient_name || !patient_age || !patient_phone || !patient_gender) {
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

    const { data: doctorType, error: typeError } = await supabase
      .from('doctor_types')
      .select('id')
      .eq('department_id', department_id)
      .eq('type', doctor_type)
      .single();

    if (typeError || !doctorType) {
      return res.status(404).json({ error: 'نوع الطبيب غير موجود' });
    }

    const { data: customSlot, error: customError } = await supabase
      .from('custom_slots')
      .select('id, capacity, from_time, to_time')
      .eq('id', slot_id)
      .eq('doctor_type_id', doctorType.id)
      .eq('date', booking_date)
      .single();

    if (customError || !customSlot) {
      return res.status(404).json({ error: 'الموعد غير موجود' });
    }

    // ✅ التحقق من أن الوقت المطلوب متاح
    if (booking_time < customSlot.from_time || booking_time >= customSlot.to_time) {
      return res.status(400).json({ 
        error: `الوقت غير متاح. الفترة المتاحة: ${customSlot.from_time} - ${customSlot.to_time}` 
      });
    }

    // ✅ التحقق من عدد الحجوزات (السعة)
    const { data: bookingsCount, error: countError } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('custom_slot_id', slot_id);

    if (countError) throw countError;

    if (bookingsCount >= customSlot.capacity) {
      return res.status(400).json({ error: 'الموعد مكتمل، لا توجد أماكن متاحة' });
    }

    const bookingData = {
      department_id,
      doctor_type_id: doctorType.id,
      custom_slot_id: slot_id,
      booking_date,
      booking_time,
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

    res.status(201).json(booking);
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

/**
 * GET /api/bookings/all
 * جلب كل الحجوزات
 */
app.get('/api/bookings/all', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('bookings')
      .select(`
        *,
        departments:department_id(name),
        doctor_types:doctor_type_id(type, label),
        custom_slots:custom_slot_id(date, from_time, to_time, capacity)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

/**
 * GET /api/bookings/department/:departmentId
 * جلب حجوزات قسم معين
 */
app.get('/api/bookings/department/:departmentId', async (req, res) => {
  try {
    const { departmentId } = req.params;

    const { data, error } = await supabase
      .from('bookings')
      .select(`
        *,
        doctor_types:doctor_type_id(type, label),
        custom_slots:custom_slot_id(date, from_time, to_time, capacity)
      `)
      .eq('department_id', departmentId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

/**
 * DELETE /api/bookings/:id
 * إلغاء حجز
 */
app.delete('/api/bookings/:id', async (req, res) => {
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

// ============================
// 7. تشغيل الخادم
// ============================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Supabase: ${supabaseUrl ? '✅ Connected' : '❌ Not connected'}`);
  console.log(`🔐 JWT: ${jwtSecret ? '✅ Configured' : '❌ Missing'}`);
  console.log(`📦 Version: 3.0.0 (مع منع تكرار رقم التليفون)`);
});

module.exports = app;