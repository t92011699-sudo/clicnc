import { supabase } from '../config/supabase.js';
import { sendResponse, sendError, getIdFromUrl } from '../utils/helpers.js';

// GET /api/departments
export async function GET(req) {
    try {
        const { data, error } = await supabase
            .from('departments')
            .select('*')
            .order('name');
            
        if (error) throw error;
        return sendResponse(data);
    } catch (error) {
        return sendError(error.message);
    }
}

// POST /api/departments
export async function POST(req) {
    try {
        const { name, description } = await req.json();
        
        if (!name || name.trim() === '') {
            return sendError('اسم القسم مطلوب', 400);
        }
        
        const { data, error } = await supabase
            .from('departments')
            .insert([{ name: name.trim(), description: description || '' }])
            .select();
            
        if (error) throw error;
        return sendResponse(data[0], 201);
    } catch (error) {
        return sendError(error.message);
    }
}

// PUT /api/departments/{id}
export async function PUT(req) {
    try {
        const id = getIdFromUrl(new URL(req.url));
        const { name, description } = await req.json();
        
        if (!name || name.trim() === '') {
            return sendError('اسم القسم مطلوب', 400);
        }
        
        const { data, error } = await supabase
            .from('departments')
            .update({ 
                name: name.trim(), 
                description: description || '',
                updated_at: new Date() 
            })
            .eq('id', id)
            .select();
            
        if (error) throw error;
        if (!data || data.length === 0) {
            return sendError('القسم غير موجود', 404);
        }
        return sendResponse(data[0]);
    } catch (error) {
        return sendError(error.message);
    }
}

// DELETE /api/departments/{id}
export async function DELETE(req) {
    try {
        const id = getIdFromUrl(new URL(req.url));
        
        const { count, error: countError } = await supabase
            .from('doctors')
            .select('*', { count: 'exact', head: true })
            .eq('department_id', id);
            
        if (countError) throw countError;
        
        if (count > 0) {
            return sendError('لا يمكن حذف القسم لأنه يحتوي على أطباء', 400);
        }
        
        const { error } = await supabase
            .from('departments')
            .delete()
            .eq('id', id);
            
        if (error) throw error;
        return sendResponse({ message: 'تم حذف القسم بنجاح' });
    } catch (error) {
        return sendError(error.message);
    }
}