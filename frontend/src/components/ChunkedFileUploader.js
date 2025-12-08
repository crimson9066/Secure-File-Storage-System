import React, { useState, useContext } from 'react';
import { apiCall } from '../utils/api';
import { NotificationContext } from '../context/NotificationContext';

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks

export const ChunkedFileUploader = ({ onUploadComplete }) => {
  const [file, setFile] = useState(null);
  const [uploadId, setUploadId] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const { addNotification } = useContext(NotificationContext);

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setUploadProgress(0);
    }
  };

  const initiatUpload = async () => {
    if (!file) {
      addNotification('Select a file', 'warning');
      return;
    }

    setLoading(true);
    try {
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      
      const initResp = await apiCall('/files/chunk/init', {
        method: 'POST',
        body: JSON.stringify({
          filename: file.name,
          totalSize: file.size,
          totalChunks,
          chunkSize: CHUNK_SIZE
        })
      });

      setUploadId(initResp.uploadId);
      await uploadChunks(initResp.uploadId, totalChunks);
    } catch (error) {
      addNotification(`Upload init failed: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const uploadChunks = async (id, totalChunks) => {
    try {
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);

        // In production, compute hash and encrypt chunk
        const chunkHash = await computeChunkHash(chunk);

        const formData = new FormData();
        formData.append('chunkData', chunk);

        await apiCall(`/files/chunk/append`, {
          method: 'POST',
          body: JSON.stringify({
            uploadId: id,
            chunkIndex: i,
            chunkHash
          })
        });

        setUploadProgress(Math.round(((i + 1) / totalChunks) * 100));
      }

      addNotification('All chunks uploaded, finalizing...', 'success');
    } catch (error) {
      addNotification(`Chunk upload failed: ${error.message}`, 'error');
      throw error;
    }
  };

  const computeChunkHash = async (chunk) => {
    // Use Web Crypto API for SHA-256
    const buffer = await chunk.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  return (
    <div className="space-y-4 p-4 border border-dashed border-gray-300 rounded-lg">
      <h3 className="font-semibold">Large File Upload (Chunked)</h3>
      
      <input
        type="file"
        onChange={handleFileSelect}
        disabled={loading}
        className="block w-full"
      />

      {file && (
        <p className="text-sm text-gray-600">
          Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
        </p>
      )}

      {uploadProgress > 0 && (
        <div className="space-y-2">
          <div className="w-full bg-gray-200 rounded h-2">
            <div
              className="bg-blue-500 h-2 rounded transition-all"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <p className="text-sm text-gray-600">{uploadProgress}% uploaded</p>
        </div>
      )}

      <button
        onClick={initiatUpload}
        disabled={loading || !file}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
      >
        {loading ? 'Uploading...' : 'Start Upload'}
      </button>
    </div>
  );
};
