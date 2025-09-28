import React, { useState, useCallback, useRef } from "react";
import { Meal } from "@/api/entities";
import { UploadFile, InvokeLLM } from "@/api/integrations";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ArrowLeft, Camera, Upload, Loader2, AlertCircle } from "lucide-react";
import { format } from "date-fns";

import PhotoUploadZone from "../components/upload/PhotoUploadZone";
import NutritionTable from "../components/upload/NutritionTable";
import MealPreview from "../components/upload/MealPreview";

export default function UploadPage() {
  const navigate = useNavigate();
  const [uploadedPhoto, setUploadedPhoto] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [step, setStep] = useState('upload'); // upload, analyze, edit

  const handlePhotoUpload = async (file) => {
    setError(null);
    try {
      const { file_url } = await UploadFile({ file });
      setUploadedPhoto({ file, url: file_url });
      setStep('analyze');
    } catch (error) {
      setError("Failed to upload photo. Please try again.");
      console.error("Upload error:", error);
    }
  };

  const analyzePhoto = async () => {
    if (!uploadedPhoto) return;
    
    setIsAnalyzing(true);
    setError(null);
    
    try {
      const result = await InvokeLLM({
        prompt: `Analyze this food image and provide detailed nutritional information. 
        Identify the food items, estimate portion sizes, and calculate comprehensive nutrition data.
        Be as accurate as possible based on what you can see in the image.
        Provide a descriptive name for the meal/dish.`,
        file_urls: [uploadedPhoto.url],
        response_json_schema: {
          type: "object",
          properties: {
            meal_name: { type: "string" },
            calories: { type: "number" },
            protein: { type: "number" },
            carbs: { type: "number" },
            fat: { type: "number" },
            fiber: { type: "number" },
            sugar: { type: "number" },
            sodium: { type: "number" },
            potassium: { type: "number" },
            calcium: { type: "number" },
            iron: { type: "number" },
            vitamin_c: { type: "number" },
            vitamin_a: { type: "number" },
            analysis_notes: { type: "string" }
          }
        }
      });

      setAnalysisResult({
        ...result,
        photo_url: uploadedPhoto.url,
        meal_date: format(new Date(), 'yyyy-MM-dd'),
        meal_type: getMealTypeByTime()
      });
      setStep('edit');
    } catch (error) {
      setError("Failed to analyze the photo. Please try again.");
      console.error("Analysis error:", error);
    }
    
    setIsAnalyzing(false);
  };

  const getMealTypeByTime = () => {
    const hour = new Date().getHours();
    if (hour < 11) return 'breakfast';
    if (hour < 16) return 'lunch';
    if (hour < 20) return 'dinner';
    return 'snack';
  };

  const handleSaveMeal = async (mealData) => {
    setIsSaving(true);
    setError(null);
    
    try {
      await Meal.create(mealData);
      navigate(createPageUrl("Dashboard"));
    } catch (error) {
      setError("Failed to save meal. Please try again.");
      console.error("Save error:", error);
    }
    
    setIsSaving(false);
  };

  const resetUpload = () => {
    setUploadedPhoto(null);
    setAnalysisResult(null);
    setError(null);
    setStep('upload');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-emerald-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate(createPageUrl("Dashboard"))}
            className="rounded-xl border-gray-200 hover:bg-gray-50"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Upload New Meal</h1>
            <p className="text-gray-600 mt-1">Take a photo and let AI analyze the nutrition</p>
          </div>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6 rounded-xl border-red-200 bg-red-50">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-red-800">{error}</AlertDescription>
          </Alert>
        )}

        {/* Upload Step */}
        {step === 'upload' && (
          <PhotoUploadZone onPhotoUpload={handlePhotoUpload} />
        )}

        {/* Analysis Step */}
        {step === 'analyze' && uploadedPhoto && (
          <Card className="border-0 shadow-xl rounded-2xl overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white p-6">
              <CardTitle className="flex items-center gap-3 text-xl">
                <Camera className="w-6 h-6" />
                Ready to Analyze
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <MealPreview 
                photo={uploadedPhoto}
                onAnalyze={analyzePhoto}
                onRetake={resetUpload}
                isAnalyzing={isAnalyzing}
              />
            </CardContent>
          </Card>
        )}

        {/* Edit Step */}
        {step === 'edit' && analysisResult && (
          <NutritionTable
            initialData={analysisResult}
            onSave={handleSaveMeal}
            onCancel={resetUpload}
            isSaving={isSaving}
          />
        )}
      </div>
    </div>
  );
}