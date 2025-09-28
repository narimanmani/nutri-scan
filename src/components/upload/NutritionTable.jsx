import React, { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Edit3, Loader2, ImagePlus } from "lucide-react";
import { getDataUrlFromFile } from "@/api/openaiClient";

export default function NutritionTable({ initialData, onSave, onCancel, isSaving, allowPhotoChange = false }) {
  const [editedData, setEditedData] = useState(initialData);
  const fileInputRef = useRef(null);

  useEffect(() => {
    setEditedData(initialData);
  }, [initialData]);

  const handleInputChange = (field, value) => {
    setEditedData(prev => ({
      ...prev,
      [field]: field === 'meal_name' || field === 'notes' || field === 'meal_date' || field === 'meal_type'
        ? value
        : parseFloat(value) || 0
    }));
  };

  const handlePhotoSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const dataUrl = await getDataUrlFromFile(file);
      setEditedData((prev) => ({
        ...prev,
        photo_url: dataUrl,
      }));
    } catch (error) {
      console.error('Failed to process the selected photo:', error);
    }
  };

  const nutritionFields = [
    { key: 'calories', label: 'Calories', unit: 'cal' },
    { key: 'protein', label: 'Protein', unit: 'g' },
    { key: 'carbs', label: 'Carbohydrates', unit: 'g' },
    { key: 'fat', label: 'Fat', unit: 'g' },
    { key: 'fiber', label: 'Fiber', unit: 'g' },
    { key: 'sugar', label: 'Sugar', unit: 'g' },
    { key: 'sodium', label: 'Sodium', unit: 'mg' },
    { key: 'potassium', label: 'Potassium', unit: 'mg' },
    { key: 'calcium', label: 'Calcium', unit: 'mg' },
    { key: 'iron', label: 'Iron', unit: 'mg' },
    { key: 'vitamin_c', label: 'Vitamin C', unit: 'mg' },
    { key: 'vitamin_a', label: 'Vitamin A', unit: 'IU' }
  ];

  return (
    <div className="space-y-6">
      {/* Photo Preview */}
      <Card className="border-0 shadow-lg rounded-2xl overflow-hidden">
        <CardContent className="p-0">
          <img
            src={editedData.photo_url}
            alt="Analyzed meal"
            className="w-full h-48 object-cover"
          />
          {allowPhotoChange && (
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
              <Button
                type="button"
                variant="outline"
                className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus className="w-4 h-4 mr-2" />
                Change photo
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoSelect}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Meal Details */}
      <Card className="border-0 shadow-lg rounded-2xl">
        <CardHeader className="p-6">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Edit3 className="w-6 h-6 text-emerald-600" />
            Review & Edit Details
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          {/* Basic Info */}
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="meal_name" className="text-sm font-medium text-gray-700">Meal Name</Label>
              <Input
                id="meal_name"
                value={editedData.meal_name || ''}
                onChange={(e) => handleInputChange('meal_name', e.target.value)}
                className="mt-2 rounded-xl border-gray-200 focus:border-emerald-300 focus:ring-emerald-200"
              />
            </div>
            
            <div>
              <Label htmlFor="meal_type" className="text-sm font-medium text-gray-700">Meal Type</Label>
              <Select 
                value={editedData.meal_type || 'lunch'} 
                onValueChange={(value) => handleInputChange('meal_type', value)}
              >
                <SelectTrigger className="mt-2 rounded-xl border-gray-200">
                  <SelectValue placeholder="Select meal type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="breakfast">Breakfast</SelectItem>
                  <SelectItem value="lunch">Lunch</SelectItem>
                  <SelectItem value="dinner">Dinner</SelectItem>
                  <SelectItem value="snack">Snack</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="meal_date" className="text-sm font-medium text-gray-700">Date</Label>
              <Input
                id="meal_date"
                type="date"
                value={editedData.meal_date || ''}
                onChange={(e) => handleInputChange('meal_date', e.target.value)}
                className="mt-2 rounded-xl border-gray-200 focus:border-emerald-300 focus:ring-emerald-200"
              />
            </div>
          </div>

          {/* Nutrition Grid */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-4">Nutritional Information</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {nutritionFields.map((field) => (
                <div key={field.key} className="space-y-2">
                  <Label htmlFor={field.key} className="text-sm font-medium text-gray-700">
                    {field.label} ({field.unit})
                  </Label>
                  <Input
                    id={field.key}
                    type="number"
                    step={field.key === 'calories' ? '1' : '0.1'}
                    min="0"
                    value={editedData[field.key] || ''}
                    onChange={(e) => handleInputChange(field.key, e.target.value)}
                    className="rounded-xl border-gray-200 focus:border-emerald-300 focus:ring-emerald-200"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="notes" className="text-sm font-medium text-gray-700">Notes (Optional)</Label>
            <Textarea
              id="notes"
              value={editedData.notes || ''}
              onChange={(e) => handleInputChange('notes', e.target.value)}
              placeholder="Add any additional notes about this meal..."
              className="mt-2 rounded-xl border-gray-200 focus:border-emerald-300 focus:ring-emerald-200"
              rows={3}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 pt-4">
            <Button
              onClick={() => onSave(editedData)}
              disabled={isSaving}
              className="bg-emerald-600 hover:bg-emerald-700 px-8 py-3 rounded-xl flex items-center gap-2 flex-1 sm:flex-none"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Save Meal
                </>
              )}
            </Button>
            
            <Button
              variant="outline"
              onClick={onCancel}
              disabled={isSaving}
              className="border-gray-200 hover:bg-gray-50 px-8 py-3 rounded-xl flex-1 sm:flex-none"
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}