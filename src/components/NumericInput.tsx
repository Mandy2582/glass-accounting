'use client';

import React, { useState, useEffect } from 'react';

interface NumericInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
    value: number | string;
    onChange: (val: number) => void;
    precision?: number;
}

export default function NumericInput({
    value,
    onChange,
    className,
    style,
    placeholder,
    min,
    step,
    disabled,
    required,
    precision,
    ...props
}: NumericInputProps) {
    const [localValue, setLocalValue] = useState('');
    const [isFocused, setIsFocused] = useState(false);

    const normalizeForDisplay = (nextValue: number | string) => {
        if (nextValue === undefined || nextValue === null || nextValue === '') return '';
        if (Number(nextValue) === 0) return '';
        return String(nextValue);
    };

    // Sync state with parent prop when not focused
    useEffect(() => {
        if (!isFocused) {
            setLocalValue(normalizeForDisplay(value));
        }
    }, [value, isFocused]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const valStr = e.target.value;
        setLocalValue(valStr);
        
        // Let parent know the new parsed number
        const parsed = valStr === '' ? 0 : Number(valStr);
        if (!isNaN(parsed)) {
            onChange(parsed);
        }
    };

    const handleBlur = () => {
        setIsFocused(false);
        const parsed = localValue === '' ? 0 : Number(localValue);
        if (!isNaN(parsed)) {
            const normalized = precision === undefined ? parsed : Number(parsed.toFixed(precision));
            setLocalValue(normalizeForDisplay(normalized));
            onChange(normalized);
        }
    };

    const handleFocus = () => {
        setIsFocused(true);
        if (Number(localValue) === 0) {
            setLocalValue('');
        }
    };

    return (
        <input
            type="number"
            className={className}
            style={style}
            placeholder={placeholder}
            value={localValue}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            min={min}
            step={step}
            disabled={disabled}
            required={required}
            {...props}
        />
    );
}
