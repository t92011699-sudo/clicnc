 const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(cors({
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/departments', require('./routes/departments'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/bookings', require('./routes/bookings')); // ✅ موجود

// ✅ Route مباشر للـ available-slots
app.get('/api/available-slots', async (req, res) => {
    try {
        const { doctor_id, date } = req.query;
        const { supabase } = require('./config/supabase');

        if (!doctor_id || !date) {
            return res.status(400).json({ 
                success: false,
                error: '❌ الدكتور والتاريخ مطلوبين' 
            });
        }

        const dateObj = new Date(date + 'T00:00:00');
        const dayOfWeek = dateObj.toLocaleDateString('en-US', { weekday: 'long' });

        const { data, error } = await supabase
            .from('time_slots')
            .select(`
                *,
                bookings:bookings(count)
            `)
            .eq('doctor_id', doctor_id)
            .eq('day_of_week', dayOfWeek)
            .eq('is_active', true);

        if (error) {
            return res.status(500).json({ 
                success: false,
                error: error.message 
            });
        }

        const availableSlots = data
            .map(slot => {
                const bookedCount = slot.bookings[0]?.count || 0;
                return {
                    ...slot,
                    booked_count: bookedCount,
                    available_slots: slot.max_bookings - bookedCount,
                    is_available: (slot.max_bookings - bookedCount) > 0
                };
            })
            .filter(slot => slot.is_available);

        res.json({
            success: true,
            available_slots: availableSlots
        });
    } catch (error) {
        console.error('❌ خطأ:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ✅ Calendar endpoint
app.get('/api/calendar', async (req, res) => {
    try {
        const { year, month } = req.query;
        const { supabase } = require('./config/supabase');

        // جلب الحجوزات في الشهر
        const startDate = `${year}-${month.padStart(2, '0')}-01`;
        const endDate = `${year}-${month.padStart(2, '0')}-31`;

        const { data, error } = await supabase
            .from('bookings')
            .select('booking_date, time_slot_id')
            .gte('booking_date', startDate)
            .lte('booking_date', endDate);

        if (error) throw error;

        // تجميع الحجوزات حسب اليوم
        const bookingsByDate = {};
        data.forEach(b => {
            if (!bookingsByDate[b.booking_date]) {
                bookingsByDate[b.booking_date] = 0;
            }
            bookingsByDate[b.booking_date]++;
        });

        // إنشاء أيام الشهر
        const daysInMonth = new Date(year, month, 0).getDate();
        const calendar = [];
        for (let i = 1; i <= daysInMonth; i++) {
            const date = `${year}-${month.padStart(2, '0')}-${i.toString().padStart(2, '0')}`;
            calendar.push({
                date,
                bookings_count: bookingsByDate[date] || 0
            });
        }

        res.json({
            success: true,
            calendar: {
                year: parseInt(year),
                month: parseInt(month),
                days: calendar
            }
        });
    } catch (error) {
        console.error('❌ خطأ في التقويم:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ✅ Stats endpoint
app.get('/api/stats', async (req, res) => {
    try {
        const { supabase } = require('./config/supabase');

        // عدد الأقسام
        const { count: deptCount } = await supabase
            .from('departments')
            .select('*', { count: 'exact', head: true });

        // عدد الدكاترة
        const { count: doctorCount } = await supabase
            .from('doctors')
            .select('*', { count: 'exact', head: true })
            .eq('is_super_admin', false);

        // عدد الحجوزات
        const { count: bookingCount } = await supabase
            .from('bookings')
            .select('*', { count: 'exact', head: true });

        // حجوزات اليوم
        const today = new Date().toISOString().split('T')[0];
        const { count: todayBookings } = await supabase
            .from('bookings')
            .select('*', { count: 'exact', head: true })
            .eq('booking_date', today);

        // الفترات المتاحة
        const { count: availableSlots } = await supabase
            .from('time_slots')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', true);

        res.json({
            success: true,
            stats: {
                total_departments: deptCount || 0,
                total_doctors: doctorCount || 0,
                total_bookings: bookingCount || 0,
                today_bookings: todayBookings || 0,
                available_slots: availableSlots || 0
            }
        });
    } catch (error) {
        console.error('❌ خطأ في الإحصائيات:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: '✅ Server is running',
        timestamp: new Date().toISOString()
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: '❌ Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('❌ Error:', err.stack);
    res.status(500).json({ error: '❌ حدث خطأ في السيرفر' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
    console.log(`📅 Available slots: http://localhost:${PORT}/api/available-slots?doctor_id=ID&date=2026-07-05\n`);
});

module.exports = app;