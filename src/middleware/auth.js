const jwt = require('jsonwebtoken');
const { supabase } = require('../config/supabase');

const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: '❌ يرجى تسجيل الدخول أولاً' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const { data: doctor, error } = await supabase
      .from('doctors')
      .select('*')
      .eq('id', decoded.id)
      .single();

    if (error || !doctor) {
      return res.status(401).json({ error: '❌ توكن غير صالح' });
    }

    if (!doctor.is_active) {
      return res.status(403).json({ error: '❌ الحساب معطل' });
    }

    req.user = doctor;
    next();
  } catch (error) {
    return res.status(401).json({ error: '❌ فشل التحقق من الهوية' });
  }
};

const isSuperAdmin = (req, res, next) => {
  if (!req.user.is_super_admin) {
    return res.status(403).json({ error: '❌ هذه الصلاحية متاحة فقط للسوبر أدمن' });
  }
  next();
};

module.exports = { authenticate, isSuperAdmin };