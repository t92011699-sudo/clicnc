 import { supabase } from '../config/supabase.js';
import { sendResponse, sendError } from '../utils/helpers.js';

// POST /api/admin - تسجيل دخول المشرف
export async function POST(req) {
    try {
        const { email, password } = await req.json();
        
        if (!email || !password) {
            return sendError('البريد الإلكتروني وكلمة المرور مطلوبان', 400);
        }
        
        const { data, error } = await supabase
            .from('admins')
            .select('id, email, created_at')
            .eq('email', email)
            .eq('password', password)
            .single();
            
        if (error || !data) {
            return sendError('بيانات الدخول غير صحيحة', 401);
        }
        
        return sendResponse({
            admin: data,
            message: 'تم تسجيل الدخول بنجاح'
        });
    } catch (error) {
        return sendError(error.message);
    }
}

// GET /api/admin/stats - الحصول على إحصائيات
export async function GET_stats(req) {
    try {
        const [
            { data: bookings, error: bError },
            { data: departments, error: dError },
            { data: doctors, error: docError }
        ] = await Promise.all([
            supabase.from('bookings').select('*'),
            supabase.from('departments').select('*'),
            supabase.from('doctors').select('*')
        ]);
        
        if (bError || dError || docError) throw new Error();
        
        const today = new Date().toISOString().split('T')[0];
        const todayCount = bookings?.filter(b => 
            b.created_at?.startsWith(today)
        ).length || 0;
        
        return sendResponse({
            total_bookings: bookings?.length || 0,
            total_departments: departments?.length || 0,
            total_doctors: doctors?.length || 0,
            today_bookings: todayCount
        });
    } catch (error) {
        return sendError(error.message);
    }
}

// GET /api/admin/calendar - الحصول على أيام الشهر مع الفترات
export async function GET_calendar(req) {
    try {
        const url = new URL(req.url);
        const doctorId = url.searchParams.get('doctorId');
        const month = url.searchParams.get('month');
        const year = url.searchParams.get('year');
        
        if (!doctorId) return sendError('معرف الطبيب مطلوب', 400);
        if (!month) return sendError('الشهر مطلوب', 400);
        if (!year) return sendError('السنة مطلوبة', 400);
        
        // جلب كل الفترات للطبيب في هذا الشهر
        const startDate = `${year}-${month.padStart(2, '0')}-01`;
        const endDate = `${year}-${month.padStart(2, '0')}-31`;
        
        const { data, error } = await supabase
            .from('time_slots')
            .select('*')
            .eq('doctor_id', doctorId)
            .gte('date', startDate)
            .lte('date', endDate)
            .order('date')
            .order('start_time');
            
        if (error) throw error;
        
        // تجميع الفترات حسب اليوم
        const calendar = {};
        data.forEach(slot => {
            if (!calendar[slot.date]) {
                calendar[slot.date] = [];
            }
            calendar[slot.date].push(slot);
        });
        
        return sendResponse({
            year,
            month,
            days: calendar,
            total_slots: data.length
        });
    } catch (error) {
        return sendError(error.message);
    }
}