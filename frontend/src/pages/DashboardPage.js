import React, { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { NotificationContext } from '../context/NotificationContext';
import { FileUploader, UploadProgress } from '../components/FileUploader';
import { FileList } from '../components/FileList';
import { Modal } from '../components/Modal';
import { encryptFileData, calculateSHA256 } from '../utils/encryption';
import { uploadFile, apiCall } from '../utils/api';

export const DashboardPage = () => {
  const [files, setFiles] = useState([]);
  const [sharedFiles, setSharedFiles] = useState([]);
  const [storageStats, setStorageStats] = useState({ fileCount: 0, totalSize: 0 });
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentFileName, setCurrentFileName] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const { user, logout } = useContext(AuthContext);
  const { addNotification } = useContext(NotificationContext);
  const navigate = useNavigate();

  useEffect(() => {
    loadFiles();
  }, []);

  const loadFiles = async () => {
    setLoading(true);
    try {
      const response = await apiCall('/files/list');
      setFiles(response.ownFiles || []);
      setSharedFiles(response.sharedFiles || []);
      setStorageStats(response.stats || { fileCount: 0, totalSize: 0 });
    } catch (error) {
      addNotification(`Failed to load files: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelected = async (file) => {
    if (uploading) {
      addNotification('Upload already in progress', 'warning');
      return;
    }

    setUploading(true);
    setCurrentFileName(file.name);
    setUploadProgress(0);

    try {
      const fileBuffer = await file.arrayBuffer();
      const buffer = new Uint8Array(fileBuffer);

      const encrypted = await encryptFileData(buffer);
      
      const fileHash = await calculateSHA256(buffer);

      const formData = new FormData();
      formData.append('file', new Blob([encrypted.encryptedData]), file.name);
      formData.append('encryptedKey', JSON.stringify({
        keyBase64: encrypted.keyBase64,
        ivBase64: encrypted.ivBase64
      }));

      setUploadProgress(0);
      const response = await uploadFile(formData.get('file'), formData.get('encryptedKey'));

      setUploadProgress(100);

      addNotification(`${file.name} uploaded successfully`, 'success');
      setTimeout(() => {
        setUploading(false);
        setUploadProgress(0);
        setCurrentFileName('');
        loadFiles();
      }, 500);
    } catch (error) {
      addNotification(`Upload failed: ${error.message}`, 'error');
      setUploading(false);
      setUploadProgress(0);
      setCurrentFileName('');
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">
              SecureVault
            </h1>
            <p className="text-sm text-gray-600">Welcome, {user?.email}</p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => setSettingsOpen(true)}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-semibold"
            >
              Settings
            </button>
            <button
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 font-semibold"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Storage Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm font-semibold">Files</p>
            <p className="text-3xl font-bold text-blue-600">{storageStats.fileCount}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm font-semibold">Storage Used</p>
            <p className="text-3xl font-bold text-purple-600">{formatBytes(storageStats.totalSize)}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm font-semibold">Encryption</p>
            <p className="text-3xl font-bold text-green-600">AES-256</p>
          </div>
        </div>

        {/* Upload Section */}
        <div className="bg-white rounded-lg shadow p-8 mb-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">Upload Files</h2>
          {uploading ? (
            <UploadProgress fileName={currentFileName} progress={uploadProgress} />
          ) : (
            <FileUploader onFileSelected={handleFileSelected} disabled={uploading} />
          )}
        </div>

        {/* Files Section */}
        <div className="bg-white rounded-lg shadow p-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">Files</h2>
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="loader"></div>
            </div>
          ) : (
            <FileList files={files} sharedFiles={sharedFiles} onRefresh={loadFiles} />
          )}
        </div>
      </main>

      {/* Settings Modal */}
      <Modal isOpen={settingsOpen} title="Settings" onClose={() => setSettingsOpen(false)} size="md">
        <div className="space-y-6">
          <div className="border-b pb-4">
            <h3 className="font-semibold text-lg text-gray-800 mb-4">Account</h3>
            <p className="text-gray-600 mb-2">Email: {user?.email}</p>
            <button
              onClick={() => {}}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              Change Password
            </button>
          </div>
          
          <div className="border-b pb-4">
            <h3 className="font-semibold text-lg text-gray-800 mb-4">Security</h3>
            <button
              onClick={() => {}}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 mr-2"
            >
              Backup Private Key
            </button>
            <button
              onClick={() => {}}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              Enable 2FA
            </button>
          </div>

          <div>
            <h3 className="font-semibold text-lg text-gray-800 mb-4">About</h3>
            <p className="text-sm text-gray-600">
              SecureVault v1.0 - End-to-end encrypted file storage with AES-256-GCM encryption.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
};
