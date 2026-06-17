import { db } from './storage';
import { EmployeeConfig } from '@/types';

/**
 * Fetch employee-specific configuration (overtime rate, ceiling, advances, overtime logs)
 * stored inside the global business settings.
 */
export async function getEmployeeConfig(employeeId: string): Promise<EmployeeConfig> {
    const businessConfig = await db.businessConfig.get();
    const configs = businessConfig.employeeConfigs || {};
    const empConfig = configs[employeeId];

    if (!empConfig) {
        return {
            employeeId,
            overtimeRate: 100, // Default overtime rate of ₹100 per hour
            maxOvertimeCeiling: 0, // Default no ceiling limit (0)
            advances: [],
            overtimeLogs: []
        };
    }

    return {
        employeeId,
        overtimeRate: empConfig.overtimeRate ?? 100,
        maxOvertimeCeiling: empConfig.maxOvertimeCeiling ?? 0,
        advances: empConfig.advances || [],
        overtimeLogs: empConfig.overtimeLogs || []
    };
}

/**
 * Save employee-specific configuration (overtime rate, ceiling, advances, overtime logs)
 * to the global business settings.
 */
export async function saveEmployeeConfig(employeeId: string, empConfig: EmployeeConfig): Promise<void> {
    const businessConfig = await db.businessConfig.get();
    const configs = businessConfig.employeeConfigs || {};
    configs[employeeId] = empConfig;

    await db.businessConfig.update({
        ...businessConfig,
        employeeConfigs: configs
    });
}
