"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useConfirm } from "@/hooks/use-confirm";

interface RagDocument {
  id: string;
  title: string;
  source: string | null;
  url: string | null;
  chunkCount: number;
  createdAt: string;
}

interface UploadResult {
  success: boolean;
  fileName: string;
  document?: {
    id: string;
    title: string;
    source: string | null;
    url: string | undefined;
    chunkCount: number;
    pageCount?: number;
  };
  error?: string;
}

interface UploadProgress {
  fileName: string;
  status: "pending" | "uploading" | "success" | "error";
  message?: string;
}

export default function RagPage() {
  const [documents, setDocuments] = useState<RagDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { confirm, isOpen, options, handleConfirm, setIsOpen } = useConfirm();

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/rag");
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents);
      }
    } catch (error) {
      console.error("Failed to fetch documents:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;

    const validExtensions = [".pdf", ".docx", ".txt", ".md"];
    const fileArray = Array.from(files);

    // Validate all files first
    const invalidFiles = fileArray.filter((file) => {
      const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
      return !validExtensions.includes(ext);
    });

    if (invalidFiles.length > 0) {
      toast.error(
        `Invalid file type(s): ${invalidFiles
          .map((f) => f.name)
          .join(", ")}. Supported: ${validExtensions.join(", ")}`,
      );
      return;
    }

    setUploading(true);

    // Initialize progress for all files
    const initialProgress: UploadProgress[] = fileArray.map((file) => ({
      fileName: file.name,
      status: "pending",
    }));
    setUploadProgress(initialProgress);

    try {
      const formData = new FormData();
      fileArray.forEach((file) => {
        formData.append("files", file);
      });

      // Update status to uploading
      setUploadProgress(
        fileArray.map((file) => ({
          fileName: file.name,
          status: "uploading",
          message: "Processing...",
        })),
      );

      const res = await fetch("/api/admin/rag", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data: {
          success: boolean;
          totalFiles: number;
          successCount: number;
          failureCount: number;
          results: UploadResult[];
        } = await res.json();

        // Update progress with results
        const updatedProgress: UploadProgress[] = data.results.map(
          (result) => ({
            fileName: result.fileName,
            status: result.success ? "success" : "error",
            message: result.success
              ? `✓ ${result.document?.chunkCount} chunks`
              : `✕ ${result.error}`,
          }),
        );
        setUploadProgress(updatedProgress);

        // Show summary toast
        if (data.successCount > 0 && data.failureCount === 0) {
          toast.success(
            `Successfully uploaded ${data.successCount} file${
              data.successCount > 1 ? "s" : ""
            }`,
          );
        } else if (data.successCount > 0 && data.failureCount > 0) {
          toast.warning(
            `Uploaded ${data.successCount}/${data.totalFiles} files. ${data.failureCount} failed.`,
          );
        } else {
          toast.error(`Failed to upload ${data.failureCount} file(s)`);
        }

        // Refresh documents list
        fetchDocuments();

        // Clear progress after 5 seconds
        setTimeout(() => setUploadProgress([]), 5000);
      } else {
        const error = await res.json();
        setUploadProgress(
          fileArray.map((file) => ({
            fileName: file.name,
            status: "error",
            message: `✕ ${error.error}`,
          })),
        );
        toast.error(error.error || "Upload failed");
        setTimeout(() => setUploadProgress([]), 5000);
      }
    } catch (error) {
      console.error("Upload failed:", error);
      setUploadProgress(
        fileArray.map((file) => ({
          fileName: file.name,
          status: "error",
          message: "✕ Upload failed",
        })),
      );
      toast.error("Upload failed");
      setTimeout(() => setUploadProgress([]), 5000);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handleDelete(documentId: string) {
    const confirmed = await confirm({
      title: "Delete document?",
      description:
        "This will permanently delete this document and all its chunks. This action cannot be undone.",
      confirmText: "Delete",
      cancelText: "Cancel",
      variant: "destructive",
    });

    if (!confirmed) return;

    setDeleting(documentId);
    try {
      const res = await fetch(`/api/admin/rag?id=${documentId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setDocuments((docs) => docs.filter((d) => d.id !== documentId));
        toast.success("Document deleted");
      } else {
        const error = await res.json();
        toast.error(error.error || "Failed to delete");
      }
    } catch (error) {
      console.error("Delete failed:", error);
      toast.error("Failed to delete");
    } finally {
      setDeleting(null);
    }
  }

  function handleDrag(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files);
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">RAG Documents</h1>
        <p className="text-slate-600">Upload documents to the knowledge base</p>
      </div>

      {/* Upload Zone */}
      <Card className="bg-white mb-8">
        <CardHeader>
          <CardTitle>Upload Documents</CardTitle>
        </CardHeader>
        <CardContent>
          <label
            className={`block border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
              dragActive
                ? "border-blue-500 bg-blue-50"
                : "border-slate-300 hover:border-slate-400"
            } ${uploading ? "opacity-50 pointer-events-none" : ""}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt,.md"
              multiple
              onChange={(e) => handleUpload(e.target.files)}
              className="hidden"
            />

            <div className="text-4xl mb-4">📄</div>
            <p className="text-slate-600 mb-4">
              Drag &amp; drop file(s) here, or{" "}
              <span className="text-blue-600 hover:text-blue-700 font-medium">
                browse
              </span>
            </p>
            <p className="text-sm text-slate-400">
              Supported formats: PDF, DOCX, TXT, MD &bull; Multiple files
              supported
            </p>

            {uploadProgress.length > 0 && (
              <div className="mt-4 space-y-2 max-h-48 overflow-y-auto">
                {uploadProgress.map((progress) => (
                  <div
                    key={progress.fileName}
                    className={`px-4 py-2 rounded-lg text-sm ${
                      progress.status === "success"
                        ? "bg-green-100 text-green-700"
                        : progress.status === "error"
                          ? "bg-red-100 text-red-700"
                          : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">
                        {progress.fileName}
                      </span>
                      <span className="shrink-0">
                        {progress.status === "uploading" && (
                          <span className="inline-block animate-spin">⟳</span>
                        )}
                        {progress.message}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </label>
        </CardContent>
      </Card>

      {/* Documents List */}
      <Card className="bg-white">
        <CardHeader>
          <CardTitle>Documents ({documents.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900" />
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <div className="text-4xl mb-2">📭</div>
              <p>No documents uploaded yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left px-6 py-3 text-sm font-medium text-slate-600">
                      Title
                    </th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-slate-600">
                      Source
                    </th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-slate-600">
                      Chunks
                    </th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-slate-600">
                      Uploaded
                    </th>
                    <th className="px-6 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {documents.map((doc) => (
                    <tr key={doc.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-900">
                          {doc.title}
                        </div>
                        {doc.url && (
                          <a
                            href={doc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-500 hover:underline"
                          >
                            View original
                          </a>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {doc.source || "-"}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {doc.chunkCount} chunks
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        {new Date(doc.createdAt).toLocaleDateString("it-IT")}
                      </td>
                      <td className="px-6 py-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(doc.id)}
                          disabled={deleting === doc.id}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          {deleting === doc.id ? "..." : "Delete"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Help */}
      <div className="mt-8 p-4 bg-slate-100 rounded-lg">
        <h3 className="font-medium text-slate-900 mb-2">💡 How RAG works</h3>
        <p className="text-sm text-slate-600">
          Uploaded documents are automatically parsed and split into chunks.
          Each chunk is embedded using AI and stored in the vector database.
          When users ask questions, relevant chunks are retrieved and provided
          as context to the AI coach.
        </p>
      </div>
      <ConfirmDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        onConfirm={handleConfirm}
        title={options.title}
        description={options.description}
        confirmText={options.confirmText}
        cancelText={options.cancelText}
        variant={options.variant}
      />
    </div>
  );
}
