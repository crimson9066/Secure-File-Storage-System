import React, { useState, useRef } from 'react';

export const FileUploader = ({ onFileSelected, disabled = false }) => {
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelected(e.target.files[0]);
    }
  };

  return (
    <div
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition ${
        dragActive
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-300 hover:border-gray-400'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleChange}
        className="hidden"
        disabled={disabled}
      />
      <div onClick={() => !disabled && fileInputRef.current?.click()}>
        <div className="text-4xl mb-2">�</div>
        <p className="font-semibold text-gray-700">Drop files here or click to upload</p>
        <p className="text-sm text-gray-500">Files are encrypted before upload</p>
      </div>
    </div>
  );
};

export const UploadProgress = ({ fileName, progress }) => {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <p className="font-semibold text-gray-800 mb-2">Uploading: {fileName}</p>
      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
        <div
          className="bg-blue-500 h-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-sm text-gray-600 mt-2">{Math.round(progress)}%</p>
    </div>
  );
};
