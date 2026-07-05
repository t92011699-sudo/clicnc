import { supabase } from '../config/supabase.js';
import { sendResponse, sendError } from '../utils/helpers.js';

// POST /api/admin
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

// GET /api/admin/stats
export async function GET(req) {
    try {
        const url = new URL(req.url);
        
        if (!url.pathname.includes('/stats')) {
            return sendError('المسار غير موجود', 404);
        }
        
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