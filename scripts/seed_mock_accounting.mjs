import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseUrl = 'https://izyqeqstircysygbrdyn.supabase.co';
const supabaseAnonKey = 'sb_publishable_KUPWh-0PIEWPQhIYYM1njA_wcPV8-EA';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
    console.log('🚀 Starting Mock Accounting Seeder...');

    // 1. Initialize Mock Employee: Bhajan Singh
    const bhajanId = 'e2079075-87a3-4bde-a89e-b9b5f54ab17a';
    const mockEmployee = {
        id: bhajanId,
        name: 'Bhajan Singh',
        designation: 'Senior Glass Cutter',
        phone: '98765-12345',
        joining_date: '2025-01-15',
        basic_salary: 30000,
        status: 'active',
        balance: 5000 // Bhajan has an outstanding advance of ₹5,000
    };

    console.log('Inserting or updating mock employee Bhajan Singh...');
    const { error: empError } = await supabase
        .from('employees')
        .upsert(mockEmployee);

    if (empError) {
        console.error('Error inserting employee:', empError);
        return;
    }
    console.log('Bhajan Singh employee record updated.');

    // 2. Initialize Business Config settings (customAccounts)
    console.log('Updating business settings with custom ledger accounts...');
    const { data: settingsData, error: settingsFetchError } = await supabase
        .from('settings')
        .select('*')
        .eq('id', 'default')
        .maybeSingle();

    if (settingsFetchError) {
        console.error('Error fetching settings:', settingsFetchError);
        return;
    }

    const currentConfig = settingsData?.business_config || {};
    const updatedConfig = {
        ...currentConfig,
        customAccounts: [
            { id: '12345678-1111-1111-1111-111111111111', name: 'Salary Expense', type: 'expense' },
            { id: '12345678-2222-2222-2222-222222222222', name: 'Rent Expense', type: 'expense' },
            { id: '12345678-3333-3333-3333-333333333333', name: 'Electricity Expense', type: 'expense' },
            { id: '12345678-4444-4444-4444-444444444444', name: 'Office Expense', type: 'expense' },
            { id: '12345678-5555-5555-5555-555555555555', name: 'Expense Reimbursements', type: 'expense' },
            { id: '12345678-6666-6666-6666-666666666666', name: 'Sales Revenue', type: 'revenue' },
            { id: '12345678-7777-7777-7777-777777777777', name: 'Purchase Cost', type: 'expense' },
            { id: '12345678-8888-8888-8888-888888888888', name: 'Miscellaneous Expense', type: 'expense' }
        ],
        employeeConfigs: {
            ...currentConfig.employeeConfigs,
            [bhajanId]: {
                employeeId: bhajanId,
                overtimeRate: 150, // Custom rate: ₹150/hr
                maxOvertimeCeiling: 3000, // Max OT pay ₹3000
                advances: [
                    {
                        id: 'adv-mock-bhajan-1',
                        date: '2026-05-10',
                        amount: 5000,
                        deductionType: 'emi',
                        emiAmount: 1500, // Deduct ₹1500 per month
                        remaining: 5000,
                        paidOff: false,
                        repayments: []
                    }
                ],
                overtimeLogs: []
            }
        }
    };

    const { error: settingsError } = await supabase
        .from('settings')
        .upsert({
            id: 'default',
            business_config: updatedConfig,
            updated_at: new Date().toISOString()
        });

    if (settingsError) {
        console.error('Error updating business config:', settingsError);
        return;
    }
    console.log('Business configurations initialized with Custom Accounts & Overtime limits.');

    // 3. Populate daily attendance and timings note for Bhajan Singh for May 2026
    console.log('Cleaning old attendance records for Bhajan Singh (May 2026)...');
    await supabase
        .from('attendance')
        .delete()
        .eq('employee_id', bhajanId)
        .gte('date', '2026-05-01')
        .lte('date', '2026-05-31');

    console.log('Generating attendance logs with timing calculations...');
    const attendanceRecords = [];

    // May 1-5 worked normally: 9am to 6pm
    for (let day = 1; day <= 5; day++) {
        attendanceRecords.push({
            id: crypto.randomUUID(),
            employee_id: bhajanId,
            date: `2026-05-${day.toString().padStart(2, '0')}`,
            status: 'present',
            note: JSON.stringify({ clockIn: '09:00', clockOut: '18:00', overtime: 0 })
        });
    }

    // May 6: Overtime worked: 9am to 9:30pm (12.5 hrs worked, 3.5 hrs OT)
    attendanceRecords.push({
        id: crypto.randomUUID(),
        employee_id: bhajanId,
        date: '2026-05-06',
        status: 'present',
        note: JSON.stringify({ clockIn: '09:00', clockOut: '21:30', overtime: 3.5 })
    });

    // May 7: Overtime worked: 9am to 8:00pm (11 hrs worked, 2 hrs OT)
    attendanceRecords.push({
        id: crypto.randomUUID(),
        employee_id: bhajanId,
        date: '2026-05-07',
        status: 'present',
        note: JSON.stringify({ clockIn: '09:00', clockOut: '20:00', overtime: 2 })
    });

    // May 8: Half day worked: 9am to 2:00pm (5 hrs worked, 0 OT)
    attendanceRecords.push({
        id: crypto.randomUUID(),
        employee_id: bhajanId,
        date: '2026-05-08',
        status: 'half_day',
        note: JSON.stringify({ clockIn: '09:00', clockOut: '14:00', overtime: 0 })
    });

    // May 9: On Paid Leave
    attendanceRecords.push({
        id: crypto.randomUUID(),
        employee_id: bhajanId,
        date: '2026-05-09',
        status: 'leave',
        note: 'Approved Leave'
    });

    // May 10-25: Rest of the month regular attendance
    for (let day = 10; day <= 25; day++) {
        attendanceRecords.push({
            id: crypto.randomUUID(),
            employee_id: bhajanId,
            date: `2026-05-${day.toString().padStart(2, '0')}`,
            status: 'present',
            note: JSON.stringify({ clockIn: '09:00', clockOut: '18:00', overtime: 0 })
        });
    }

    const { error: attInsertError } = await supabase
        .from('attendance')
        .insert(attendanceRecords);

    if (attInsertError) {
        console.error('Error inserting attendance:', attInsertError);
        return;
    }
    console.log(`Generated ${attendanceRecords.length} attendance records for Bhajan Singh (Total OT Hours: 5.5).`);

    // 4. Generate Mock Vouchers to verify double-entry hits
    console.log('Cleaning old mock vouchers...');
    await supabase
        .from('vouchers')
        .delete()
        .like('number', 'MCK-%');

    const mockVouchers = [
        // Office Rent Expense
        {
            id: crypto.randomUUID(),
            number: 'MCK-000001',
            date: '2026-05-01',
            type: 'expense',
            amount: 15000,
            description: 'Paid office monthly rent to landlord (Double Entry: Rent Expense Dr, Cash Cr)',
            mode: 'cash',
            party_id: '12345678-2222-2222-2222-222222222222',
            party_name: 'Rent Expense'
        },
        // Electricity Expense
        {
            id: crypto.randomUUID(),
            number: 'MCK-000002',
            date: '2026-05-05',
            type: 'expense',
            amount: 4500,
            description: 'Electricity bill payment for Punjab State Power Corp (Double Entry: Electricity Dr, Cash Cr)',
            mode: 'cash',
            party_id: '12345678-3333-3333-3333-333333333333',
            party_name: 'Electricity Expense'
        },
        // Advance salary given to Bhajan Singh
        {
            id: crypto.randomUUID(),
            number: 'MCK-000003',
            date: '2026-05-10',
            type: 'payment',
            amount: 5000,
            description: 'Salary Advance disbursed to Bhajan Singh (EMI: 1500/mo) (Double Entry: Employee Bhajan Dr, Cash Cr)',
            mode: 'cash',
            employee_id: bhajanId,
            employee_name: 'Bhajan Singh'
        },
        // Expense Reimbursement to Bhajan Singh (SHOULD BE EXCLUDED FROM SALARY STATEMENT)
        {
            id: crypto.randomUUID(),
            number: 'MCK-000004',
            date: '2026-05-15',
            type: 'payment',
            amount: 1200,
            description: 'Expense Reimbursement paid to Bhajan Singh for outstation client machine repair travel',
            mode: 'cash',
            employee_id: bhajanId,
            employee_name: 'Bhajan Singh',
            party_id: '12345678-5555-5555-5555-555555555555',
            party_name: 'Expense Reimbursements'
        }
    ];

    const { error: vInsertError } = await supabase
        .from('vouchers')
        .insert(mockVouchers);

    if (vInsertError) {
        console.error('Error inserting vouchers:', vInsertError);
        return;
    }
    console.log('✅ Generated 4 mock vouchers successfully (Rent, Electricity, Loan Advance, Reimbursement).');
    console.log('✅ Mock data populated. Open the web app to view the Salary Statement and General Ledger accounts!');
}

run();
