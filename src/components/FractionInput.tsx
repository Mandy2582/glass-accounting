'use client';

import React, { useState, useEffect } from 'react';
import { formatInchesToFraction, parseFractionToInches } from '@/lib/utils';

interface FractionInputProps {
    value: number;
    onChange: (val: number) => void;
    placeholder?: string;
    className?: string;
    style?: React.CSSProperties;
    required?: boolean;
    disabled?: boolean;
}

export default function FractionInput({
    value,
    onChange,
    placeholder,
    className,
    style,
    required,
    disabled
}: FractionInputProps) {
    const [localValue, setLocalValue] = useState('');
    const [isFocused, setIsFocused] = useState(false);

    // Sync from prop when not focused or when prop changes externally
    useEffect(() => {
        if (!isFocused) {
            setLocalValue(value ? formatInchesToFraction(value) : '');
        }
    }, [value, isFocused]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const valStr = e.target.value;
        setLocalValue(valStr);
        const parsed = parseFractionToInches(valStr);
        onChange(parsed);
    };

    const handleBlur = () => {
        setIsFocused(false);
        const parsed = parseFractionToInches(localValue);
        // Format to standard fraction string (nearest 1/8)
        setLocalValue(parsed ? formatInchesToFraction(parsed) : '');
        onChange(parsed);
    };

    const handleFocus = () => {
        setIsFocused(true);
    };

    return (
        <input
            type="text"
            className={className}
            style={style}
            placeholder={placeholder}
            value={localValue}
            onChange={handleChange}
            onBlur={handleBlur}
            onFocus={handleFocus}
            required={required}
            disabled={disabled}
        />
    );
}
