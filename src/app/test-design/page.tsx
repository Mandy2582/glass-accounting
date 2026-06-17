'use client';

import { useState } from 'react';
import { designsDb } from '@/lib/storage';

export default function TestDesignPage() {
    const [result, setResult] = useState('');
    const [error, setError] = useState('');

    const testCreate = async () => {
        setResult('Testing...');
        setError('');

        try {
            const testDesign: any = {
                id: crypto.randomUUID(),
                name: 'TEST_DESIGN',
                status: 'draft',
                createdDate: new Date().toISOString().split('T')[0],
                baseShape: 'rectangle',
                totalArea: 10,
                grossArea: 12,
                holes: 0,
                cuts: 0,
                complexityLevel: 'simple',
                baseRate: 150,
                complexityCharge: 0,
                edgeFinishingCharge: 0,
                estimatedCost: 1500,
                drawingData: { shapes: [], viewport: { x: 0, y: 0, zoom: 1 } }
            };

            await designsDb.add(testDesign);
            setResult('✅ SUCCESS! Design created successfully.');
        } catch (err: any) {
            setError(`❌ ERROR: ${err.message}\n\nFull error: ${JSON.stringify(err, null, 2)}`);
        }
    };

    return (
        <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
            <h1>Design Creation Test</h1>
            <button
                onClick={testCreate}
                style={{
                    padding: '1rem 2rem',
                    fontSize: '1.2rem',
                    background: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    marginTop: '1rem'
                }}
            >
                Test Create Design
            </button>

            {result && (
                <div style={{
                    marginTop: '2rem',
                    padding: '1rem',
                    background: '#d1fae5',
                    borderRadius: '8px',
                    whiteSpace: 'pre-wrap'
                }}>
                    {result}
                </div>
            )}

            {error && (
                <div style={{
                    marginTop: '2rem',
                    padding: '1rem',
                    background: '#fee2e2',
                    borderRadius: '8px',
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'monospace',
                    fontSize: '0.9rem'
                }}>
                    {error}
                </div>
            )}
        </div>
    );
}
