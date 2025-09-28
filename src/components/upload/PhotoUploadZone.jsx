import React, { useRef, useState } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Camera, Upload, Smartphone } from "lucide-react";

export default function PhotoUploadZone({ onPhotoUpload }) {
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileSelect = (event) => {
    const file = event.target.files?.[0];
    if (file && (file.type.startsWith('image/') || file.type === 'image/heic')) {
      onPhotoUpload(file);
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragIn = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragOut = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type.startsWith('image/')) {
      onPhotoUpload(files[0]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Main Upload Area */}
      <Card 
        className={`border-2 border-dashed rounded-2xl transition-all duration-300 cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/50 ${
          isDragging ? 'border-emerald-500 bg-emerald-50' : 'border-gray-300'
        }`}
        onDragEnter={handleDragIn}
        onDragLeave={handleDragOut}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <CardContent className="p-12 text-center">
          <div className="w-20 h-20 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Upload className="w-10 h-10 text-emerald-600" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-3">Upload Your Meal Photo</h3>
          <p className="text-gray-600 mb-6 max-w-md mx-auto">
            Drop your food image here, or click to browse. Our AI will analyze the nutrition automatically.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button 
              type="button"
              className="bg-emerald-600 hover:bg-emerald-700 px-8 py-3 rounded-xl"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
            >
              <Upload className="w-5 h-5 mr-2" />
              Choose File
            </Button>
            <span className="text-gray-400">or</span>
            <Button
              type="button"
              variant="outline"
              className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 px-8 py-3 rounded-xl"
              onClick={(e) => {
                e.stopPropagation();
                cameraInputRef.current?.click();
              }}
            >
              <Camera className="w-5 h-5 mr-2" />
              Take Photo
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Alternative Upload Options */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="border-0 shadow-md rounded-xl hover:shadow-lg transition-shadow">
          <CardContent className="p-6 text-center">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Smartphone className="w-6 h-6 text-blue-600" />
            </div>
            <h4 className="font-semibold text-gray-900 mb-2">Mobile Friendly</h4>
            <p className="text-sm text-gray-600">
              Works perfectly on your phone. Take photos directly in the app.
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md rounded-xl hover:shadow-lg transition-shadow">
          <CardContent className="p-6 text-center">
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Camera className="w-6 h-6 text-purple-600" />
            </div>
            <h4 className="font-semibold text-gray-900 mb-2">AI Powered</h4>
            <p className="text-sm text-gray-600">
              Advanced food recognition with detailed nutrition analysis.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Hidden Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
}