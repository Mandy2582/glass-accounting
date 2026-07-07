import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseUrl = 'https://izyqeqstircysygbrdyn.supabase.co';
const supabaseAnonKey = 'sb_publishable_KUPWh-0PIEWPQhIYYM1njA_wcPV8-EA';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
    console.log('Fetching active employees...');
    const { data: employees, error: empError } = await supabase
        .from('employees')
        .select('*')
        .eq('status', 'active');

    if (empError) {
        console.error('Error fetching employees:', empError);
        return;
    }

    if (!employees || employees.length === 0) {
        console.log('No active employees found to generate mock attendance for.');
        return;
    }

    console.log(`Found ${employees.length} active employees: ${employees.map(e => e.name).join(', ')}`);

    // Clean existing attendance for May 2026 using date range
    console.log('Cleaning existing attendance records for May 2026...');
    const { error: deleteError } = await supabase
        .from('attendance')
        .delete()
        .gte('date', '2026-05-01')
        .lte('date', '2026-05-31');

    if (deleteError) {
        console.error('Error cleaning old attendance:', deleteError);
        return;
    }

    const attendanceRecords = [];
    const statuses = ['present', 'present', 'present', 'present', 'present', 'present', 'half_day', 'absent', 'leave'];

    // Generate for May 1 to May 28, 2026
    for (let day = 1; day <= 28; day++) {
        const dateString = `2026-05-${day.toString().padStart(2, '0')}`;
        
        for (const emp of employees) {
            // Determine status
            const status = statuses[Math.floor(Math.random() * statuses.length)];
            
            attendanceRecords.push({
                id: crypto.randomUUID(),
                employee_id: emp.id,
                date: dateString,
                status: status,
                note: `Mock attendance generated automatically`
            });
        }
    }

    console.log(`Inserting ${attendanceRecords.length} mock attendance records...`);
    const { error: insertError } = await supabase
        .from('attendance')
        .insert(attendanceRecords);

    if (insertError) {
        console.error('Error inserting mock attendance:', insertError);
    } else {
        console.log('✅ Mock attendance generated successfully for May 2026!');
    }
}

run();
