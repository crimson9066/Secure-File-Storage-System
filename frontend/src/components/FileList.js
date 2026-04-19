import React, { useState, useContext, useEffect } from 'react';
import { apiCall } from '../utils/api';
import { NotificationContext } from '../context/NotificationContext';
import { Modal, ConfirmModal } from './Modal';

export const FileList = ({ files, sharedFiles, onRefresh }) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const { addNotification } = useContext(NotificationContext);

  const handleShare = async () => {
    if (!shareEmail) {
      addNotification('Enter recipient email', 'warning');
      return;
    }

    setLoading(true);
    try {
      const encryptedKey = selectedFile?.encrypted_key || selectedFile?.encryptedKey;

      await apiCall('/files/share', {
        method: 'POST',
        body: JSON.stringify({
          fileId: selectedFile.id,
          recipientEmail: shareEmail,
          encryptedKey: encryptedKey
        })
      });

      addNotification('File shared successfully', 'success');
      setShareModalOpen(false);
      setShareEmail('');
    } catch (error) {
      addNotification(`Share failed: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      await apiCall(`/files/delete/${selectedFile.id}`, {
        method: 'DELETE'
      });

      addNotification('File deleted successfully', 'success');
      setDeleteModalOpen(false);
      onRefresh();
    } catch (error) {
      addNotification(`Delete failed: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (file) => {
    setLoading(true);
    try {
      const response = await apiCall(`/files/download/${file.id}`);
      addNotification('Download ready — decrypt client-side', 'success');
    } catch (error) {
      addNotification(`Download failed: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };


  const formatDate = (date) => {
    try {
      const d = new Date(date);
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
    } catch {
      return date;
    }
  };
  return (
    <>
      <div className="space-y-6">
        {/* Own Files */}
        {files && files.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Your Files</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-2 text-left">Name</th>
                    <th className="px-4 py-2 text-left">Size</th>
                    <th className="px-4 py-2 text-left">Date</th>
                    <th className="px-4 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {files.map((file) => (
                    <tr key={file.id} className="border-t hover:bg-gray-50">
                      <td className="px-4 py-3">{file.filename}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatSize(file.size)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatDate(file.created_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleDownload(file)}
                          className="text-blue-500 hover:text-blue-700 mr-3"
                          title="Download"
                        >
                          <span className="text-sm font-medium">Download</span>
                        </button>
                        <button
                          onClick={() => {
                            setSelectedFile(file);
                            setShareModalOpen(true);
                          }}
                          className="text-green-500 hover:text-green-700 mr-3"
                          title="Share"
                        >
                          <span className="text-sm font-medium">Share</span>
                        </button>
                        <button
                          onClick={() => {
                            setSelectedFile(file);
                            setDeleteModalOpen(true);
                          }}
                          className="text-red-500 hover:text-red-700"
                          title="Delete"
                        >
                          <span className="text-sm font-medium">Delete</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Shared Files */}
        {sharedFiles && sharedFiles.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Shared with You</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-2 text-left">Name</th>
                    <th className="px-4 py-2 text-left">Owner</th>
                    <th className="px-4 py-2 text-left">Size</th>
                    <th className="px-4 py-2 text-left">Date</th>
                    <th className="px-4 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sharedFiles.map((file) => (
                    <tr key={file.id} className="border-t hover:bg-gray-50">
                      <td className="px-4 py-3">{file.filename}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{file.owner_email}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatSize(file.size)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatDate(file.created_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleDownload(file)}
                          className="text-blue-500 hover:text-blue-700"
                          title="Download"
                        >
                          <span className="text-sm font-medium">Download</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {(!files || files.length === 0) && (!sharedFiles || sharedFiles.length === 0) && (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg">No files yet</p>
            <p className="text-sm">Upload a file to get started</p>
          </div>
        )}
      </div>

      {/* Share Modal */}
      <Modal
        isOpen={shareModalOpen}
        title="Share File"
        onClose={() => {
          setShareModalOpen(false);
          setShareEmail('');
        }}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-gray-700">
            Share <span className="font-semibold">{selectedFile?.filename}</span> with:
          </p>
          <input
            type="email"
            value={shareEmail}
            onChange={(e) => setShareEmail(e.target.value)}
            placeholder="recipient@example.com"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={handleShare}
            disabled={loading}
            className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
          >
            {loading ? 'Sharing...' : 'Share'}
          </button>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteModalOpen}
        title="Delete File"
        message={`Are you sure you want to delete "${selectedFile?.filename}"? This cannot be undone.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteModalOpen(false)}
        isDangerous={true}
      />
    </>
  );
};
