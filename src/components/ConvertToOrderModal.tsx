'use client';

import { useState } from 'react';
import { X, Package, Calendar, FileText } from 'lucide-react';
import { CustomDesign } from '@/types';

interface ConvertToOrderModalProps {
    design: CustomDesign;
    onClose: () => void;
    onConvert: (deliveryDate: string, notes: string) => void;
}

export default function ConvertToOrderModal({ design, onClose, onConvert }: ConvertToOrderModalProps) {
    const [deliveryDate, setDeliveryDate] = useState<string>('');
    const [notes, setNotes] = useState<string>(`Converted from custom design: ${design.name}`);
    const [isConverting, setIsConverting] = useState(false);

    // Get tomorrow's date as minimum delivery date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const minDate = tomorrow.toISOString().split('T')[0];

    // Default to 7 days from now
    if (!deliveryDate) {
        const defaultDate = new Date();
        defaultDate.setDate(defaultDate.getDate() + 7);
        setDeliveryDate(defaultDate.toISOString().split('T')[0]);
    }

    const handleConvert = async () => {
        if (!deliveryDate) {
            alert('Please select a delivery date');
            return;
        }

        setIsConverting(true);
        try {
            await onConvert(deliveryDate, notes);
        } catch (error) {
            console.error('Error converting design:', error);
            alert('Failed to convert design to order');
            setIsConverting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b">
                    <div className="flex items-center gap-3">
                        <Package className="w-6 h-6 text-blue-600" />
                        <h2 className="text-xl font-semibold">Convert to Sales Order</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                    {/* Design Summary */}
                    <div className="bg-gray-50 rounded-lg p-4">
                        <h3 className="font-semibold mb-3">Design Summary</h3>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <span className="text-gray-600">Design Name:</span>
                                <p className="font-medium">{design.name}</p>
                            </div>
                            <div>
                                <span className="text-gray-600">Customer:</span>
                                <p className="font-medium">{design.customerName || 'Not specified'}</p>
                            </div>
                            <div>
                                <span className="text-gray-600">Total Area:</span>
                                <p className="font-medium">{design.totalArea.toFixed(2)} sq ft</p>
                            </div>
                            <div>
                                <span className="text-gray-600">Estimated Cost:</span>
                                <p className="font-medium text-lg text-green-600">
                                    ${design.estimatedCost.toFixed(2)}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Warning if no customer */}
                    {!design.customerId && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                            <p className="text-yellow-800 text-sm">
                                ⚠️ This design has no customer assigned. You should add a customer before converting to an order.
                            </p>
                        </div>
                    )}

                    {/* Order Details */}
                    <div>
                        <h3 className="font-semibold mb-3">Order Details</h3>

                        {/* Delivery Date */}
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                <Calendar className="w-4 h-4 inline mr-1" />
                                Delivery Date *
                            </label>
                            <input
                                type="date"
                                value={deliveryDate}
                                onChange={(e) => setDeliveryDate(e.target.value)}
                                min={minDate}
                                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                required
                            />
                        </div>

                        {/* Notes */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                <FileText className="w-4 h-4 inline mr-1" />
                                Order Notes
                            </label>
                            <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                rows={3}
                                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="Add any special instructions or notes..."
                            />
                        </div>
                    </div>

                    {/* Order Preview */}
                    <div className="bg-blue-50 rounded-lg p-4">
                        <h3 className="font-semibold mb-3">Order Preview</h3>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-gray-600">Item:</span>
                                <span className="font-medium">Custom Glass - {design.name}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-600">Quantity:</span>
                                <span className="font-medium">1 piece</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-600">Rate:</span>
                                <span className="font-medium">${design.estimatedCost.toFixed(2)}</span>
                            </div>
                            <div className="border-t pt-2 flex justify-between font-semibold">
                                <span>Total:</span>
                                <span className="text-green-600">${design.estimatedCost.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Info */}
                    <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
                        <p>
                            <strong>Note:</strong> After conversion, this design will be marked as "converted"
                            and linked to the new sales order. You'll be redirected to the order page where
                            you can make any additional changes.
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-6 border-t bg-gray-50">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg"
                        disabled={isConverting}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConvert}
                        disabled={isConverting || !deliveryDate || !design.customerId}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isConverting ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                Converting...
                            </>
                        ) : (
                            <>
                                <Package className="w-4 h-4" />
                                Convert to Order
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
