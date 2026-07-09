'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { GlassItem } from '@/types';

interface ItemSearchSelectProps {
    items: GlassItem[];
    value?: string;
    onChange: (itemId: string) => void;
    onAddNew?: () => void;
    placeholder?: string;
    addLabel?: string;
    disabled?: boolean;
}

const itemLabel = (item?: GlassItem) => {
    if (!item) return '';
    const details = item.category === 'hardware'
        ? [item.make, item.model].filter(Boolean).join(' ')
        : [item.make, item.type, item.thickness ? `${item.thickness}mm` : '', item.width && item.height ? `${item.width}" x ${item.height}"` : ''].filter(Boolean).join(' • ');
    return details ? `${item.name} (${details})` : item.name;
};

export default function ItemSearchSelect({
    items,
    value,
    onChange,
    onAddNew,
    placeholder = 'Search item...',
    addLabel = 'Add New Item',
    disabled,
}: ItemSearchSelectProps) {
    const selectedItem = items.find(item => item.id === value);
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) {
            setQuery(itemLabel(selectedItem));
        }
    }, [selectedItem, open]);

    useEffect(() => {
        const handleClick = (event: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const filteredItems = useMemo(() => {
        const search = query.trim().toLowerCase();
        if (!search) return items.slice(0, 30);
        return items.filter(item => [
            item.name,
            item.make,
            item.model,
            item.type,
            item.thickness ? `${item.thickness}mm` : '',
            item.unit,
        ].filter(Boolean).join(' ').toLowerCase().includes(search)).slice(0, 30);
    }, [items, query]);

    return (
        <div className="item-search-select" ref={rootRef}>
            <div className="item-search-input-wrap">
                <Search size={15} />
                <input
                    className="input item-search-input"
                    value={query}
                    placeholder={placeholder}
                    disabled={disabled}
                    onFocus={() => {
                        setOpen(true);
                        setQuery('');
                    }}
                    onChange={event => {
                        setQuery(event.target.value);
                        setOpen(true);
                    }}
                />
            </div>
            {open && !disabled && (
                <div className="item-search-menu">
                    {onAddNew && (
                        <button
                            type="button"
                            className="item-search-option item-search-add"
                            onMouseDown={event => event.preventDefault()}
                            onClick={() => {
                                setOpen(false);
                                onAddNew();
                            }}
                        >
                            <Plus size={14} />
                            {addLabel}
                        </button>
                    )}
                    {filteredItems.length === 0 ? (
                        <div className="item-search-empty">No matching item found</div>
                    ) : (
                        filteredItems.map(item => {
                            const stock = Number(item.stock) || 0;
                            const isLow = stock > 0 && stock <= (item.minStock || 10);
                            const isOut = stock <= 0;
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    className="item-search-option"
                                    onMouseDown={event => event.preventDefault()}
                                    onClick={() => {
                                        onChange(item.id);
                                        setOpen(false);
                                        setQuery(itemLabel(item));
                                    }}
                                >
                                    <span className="item-search-option-main">
                                        <strong>{item.name}</strong>
                                        <span>{itemLabel(item).replace(item.name, '').replace(/^\s*\(|\)\s*$/g, '') || item.unit}</span>
                                    </span>
                                    <span
                                        className="item-search-option-stock"
                                        style={{
                                            color: isOut ? '#b91c1c' : isLow ? '#b45309' : 'var(--color-text-muted)',
                                            fontWeight: isOut || isLow ? 800 : 600,
                                        }}
                                    >
                                        {isOut ? 'Out of stock' : `${stock} ${item.unit} in stock`}
                                    </span>
                                </button>
                            );
                        })
                    )}
                </div>
            )}
        </div>
    );
}
