import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RotateCcw, Zap } from "lucide-react";

export default function MealPreview({ photo, onAnalyze, onRetake, isAnalyzing }) {
  return (
    <div className="space-y-6">
      {/* Photo Preview */}
      <div className="relative">
        <img
          src={photo.url}
          alt="Meal to analyze"
          className="w-full max-w-md mx-auto rounded-2xl shadow-lg object-cover"
          style={{ aspectRatio: '4/3' }}
        />
        <div className="absolute top-4 right-4">
          <Button
            variant="outline"
            size="icon"
            onClick={onRetake}
            className="bg-white/90 backdrop-blur-sm hover:bg-white rounded-xl"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <Button
          onClick={onAnalyze}
          disabled={isAnalyzing}
          className="bg-emerald-600 hover:bg-emerald-700 px-8 py-3 rounded-xl text-white flex items-center gap-2"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Zap className="w-5 h-5" />
              Analyze Nutrition
            </>
          )}
        </Button>
        
        <Button
          variant="outline"
          onClick={onRetake}
          disabled={isAnalyzing}
          className="border-gray-200 hover:bg-gray-50 px-8 py-3 rounded-xl"
        >
          Take Another Photo
        </Button>
      </div>

      {isAnalyzing && (
        <Card className="border border-emerald-200 bg-emerald-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 text-emerald-800">
              <Loader2 className="w-5 h-5 animate-spin" />
              <div>
                <p className="font-medium">Analyzing your meal...</p>
                <p className="text-sm text-emerald-600">This may take a few seconds</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}