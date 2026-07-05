import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zvgefsuwzsivdtjfpwrd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2Z2Vmc3V3enNpdmR0amZwd3JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyNjgyNjQsImV4cCI6MjA5ODg0NDI2NH0.htfH38WzUIJAd8pghZTjhBK6N5T0uRYHOtfHxPuI88o';

export const supabase = createClient(supabaseUrl, supabaseKey);