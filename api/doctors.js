import { supabase } from '../config/supabase.js';
import { sendResponse, sendError, getIdFromUrl } from '../utils/helpers.js';

// GET /api/doctors/{departmentId}
export async function GET(req) {
    try {
        const url = new URL(req.url);
        const departmentId = getIdFromUrl(url);
        const gender = url.searchParams.get('gender');
        
        let query = supabase
            .from('doctors')
            .select('*')
            .eq('department_id', departmentId);
        
        if (gender && gender !== 'both') {
            query = query.eq('gender', gender);
        }
        
        const { data, error } = await query.order('created_at');
            
        if (error) throw error;
        return sendResponse(data);
    } catch (error) {
        return sendError(error.message);
    }
}

// POST /api/doctors
export async function POST(req) {
    try {
        const { department_id, gender } = await req.json();
        
        if (!department_id) return sendError('القسم مطلوب', 400);
        if (!gender || !['male', 'female'].includes(gender)) {
            return sendError('النوع يجب أن يكون male (دكتور) أو female (دكتورة)', 400);
        }
        
        const { data: dept, error: deptError } = await supabase
            .from('departments')
            .select('id')
            .eq('id', department_id)
            .single();
            
        if (deptError || !dept) {
            return sendError('القسم غير موجود', 404);
        }
        
        const doctorName = gender === 'male' ? 'دكتور' : 'دكتورة';
        
        const { data: doctor, error: docError } = await supabase
            .from('doctors')
            .insert([{ 
                department_id, 
                name: doctorName,
                gender: gender,
                specialization: doctorName
            }])
            .select();
            
        if (docError) throw docError;
        
        return sendResponse({
            doctor: doctor[0],
            message: `تم إضافة ${doctorName} بنجاح`
        }, 201);
    } catch (error) {
        return sendError(error.message);
    }
}

// PUT /api/doctors/{id}
export async function PUT(req) {
    try {
        const id = getIdFromUrl(new URL(req.url));
        const { gender } = await req.json();
        
        if (!gender || !['male', 'female'].includes(gender)) {
            return sendError('النوع يجب أن يكون male أو female', 400);
        }
        
        const doctorName = gender === 'male' ? 'دكتور' : 'دكتورة';
        
        const updates = {
            name: doctorName,
            gender: gender,
            specialization: doctorName,
            updated_at: new Date()
        };
        
        const { data, error } = await supabase
            .from('doctors')
            .update(updates)
            .eq('id', id)
            .select();
            
        if (error) throw error;
        if (!data || data.length === 0) {
            return sendError('الطبيب غير موجود', 404);
        }
        return sendResponse({
            doctor: data[0],
            message: `تم التعديل إلى ${doctorName}`
        });
    } catch (error) {
        return sendError(error.message);
    }
}

// DELETE /api/doctors/{id}
export async function DELETE(req) {
    try {
        const id = getIdFromUrl(new URL(req.url));
        
        const { count, error: countError } = await supabase
            .from('time_slots')
            .select('*', { count: 'exact', head: true })
            .eq('doctor_id', id);
            
        if (countError) throw countError;
        
        if (count > 0) {
            return sendError('لا يمكن حذف الطبيب لأنه لديه مواعيد', 400);
        }
        
        const { error } = await supabase
            .from('doctors')
            .delete()
            .eq('id', id);
            
        if (error) throw error;
        return sendResponse({ message: 'تم حذف الطبيب بنجاح' });
    } catch (error) {
        return sendError(error.message);
    }
}