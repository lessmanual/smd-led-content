import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Modal from "@/components/ui/modal";
import { Settings, Upload, Rocket, Save, ExternalLink, Circle, ChevronDown, ChevronUp, Edit } from "lucide-react";
import type { Post } from "@shared/schema";

// Function to convert Google Drive share link to direct image link
const convertGoogleDriveLink = (url: string): string => {
  if (!url) return '';

  // Extract file ID from various Google Drive URL formats
  let fileId = '';

  // Format: drive.google.com/uc?id=XXXXX
  const ucMatch = url.match(/[?&]id=([a-zA-Z0-9-_]+)/);
  if (ucMatch) {
    fileId = ucMatch[1];
  }

  // Format: drive.google.com/file/d/XXXXX
  const fileMatch = url.match(/\/file\/d\/([a-zA-Z0-9-_]+)/);
  if (fileMatch) {
    fileId = fileMatch[1];
  }

  // Format: drive.google.com/open?id=XXXXX
  const openMatch = url.match(/open\?id=([a-zA-Z0-9-_]+)/);
  if (openMatch) {
    fileId = openMatch[1];
  }

  if (fileId) {
    // Use lh3.googleusercontent.com format which works best for images
    return `https://lh3.googleusercontent.com/d/${fileId}=w1000`;
  }

  // If no match found, return original URL
  return url;
};

// Function to convert plain text to HTML
const convertTextToHtml = (text: string): string => {
  if (!text) return '';

  // Split by double line breaks to create paragraphs
  const paragraphs = text.split(/\n\n+/);

  return paragraphs
    .map(para => {
      // Replace single line breaks with <br>
      const withBreaks = para.replace(/\n/g, '<br>');
      // Wrap in paragraph tags
      return `<p>${withBreaks}</p>`;
    })
    .join('\n');
};

export default function Dashboard() {
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBlogExpanded, setIsBlogExpanded] = useState(false);
  const [isFacebookExpanded, setIsFacebookExpanded] = useState(false);
  const [isInstagramExpanded, setIsInstagramExpanded] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { toast } = useToast();

  // Fetch current post
  const { data: currentPost, isLoading: isLoadingPost } = useQuery<Post>({
    queryKey: ["/api/post"],
    refetchInterval: 30000, // Refetch every 30 seconds
  });


  // Fetch published posts
  const { data: publishedPosts = [], isLoading: isLoadingHistory } = useQuery<Post[]>({
    queryKey: ["/api/posts/published"],
  });

  // Fetch archived posts
  const { data: archivedPosts = [], isLoading: isLoadingArchive } = useQuery<Post[]>({
    queryKey: ["/api/posts/archived"],
  });

  // Upload image mutation (via Vercel API proxy to n8n)
  const uploadImageMutation = useMutation({
    mutationFn: async ({ rowId, oldImageUrl, file }: { rowId: string; oldImageUrl: string; file: File }) => {
      const formData = new FormData();

      // Extract row number from rowId (e.g., "ROW_5" -> 5)
      const rowNumber = parseInt(rowId.replace('ROW_', ''));

      formData.append('file', file);
      formData.append('rowId', rowId);
      formData.append('row_number', rowNumber.toString());
      formData.append('oldImageUrl', oldImageUrl || '');
      formData.append('fileName', file.name);

      // Call Vercel API endpoint (which forwards to n8n)
      const response = await fetch('/api/upload-image', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Upload failed' }));
        throw new Error(errorData.message || 'Failed to upload image');
      }

      return response.json();
    },
    onSuccess: (data) => {
      // Parse n8n response: [{ row_number: 89, Grafika: "https://..." }]
      const responseItem = Array.isArray(data) ? data[0] : data;
      const newImageUrl = responseItem?.Grafika;

      toast({
        title: "Sukces",
        description: newImageUrl
          ? "Zdjęcie zostało zaktualizowane i zapisane w Google Drive"
          : "Zdjęcie zostało zaktualizowane",
      });

      // Refresh all data to show new image
      queryClient.invalidateQueries({ queryKey: ["/api/post"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts/published"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts/archived"] });
    },
    onError: (error) => {
      console.error('Image upload error:', error);
      toast({
        title: "Błąd",
        description: "Nie udało się zaktualizować zdjęcia",
        variant: "destructive",
      });
    },
  });

  // Update cell mutation
  const updateCellMutation = useMutation({
    mutationFn: async ({ rowId, column, content }: { rowId: string; column: string; content: string }) => {
      return apiRequest("POST", "/api/post/update", { rowId, column, content });
    },
    onError: () => {
      toast({
        title: "Błąd",
        description: "Nie udało się zaktualizować zawartości",
        variant: "destructive",
      });
    },
  });

  // Publish post mutation for Social Media
  const publishSocialMutation = useMutation({
    mutationFn: async (rowId: string) => {
      return apiRequest("POST", "/api/publish", { rowId, publishType: "social-media" });
    },
    onSuccess: () => {
      toast({
        title: "Sukces",
        description: "Post został opublikowany na Social Media",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/post"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts/published"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts/archived"] });
    },
    onError: () => {
      toast({
        title: "Błąd",
        description: "Nie udało się opublikować na Social Media",
        variant: "destructive",
      });
    },
  });

  // Publish post mutation for WordPress
  const publishWordPressMutation = useMutation({
    mutationFn: async (rowId: string) => {
      return apiRequest("POST", "/api/publish", { rowId, publishType: "wordpress" });
    },
    onSuccess: () => {
      toast({
        title: "Sukces",
        description: "Post został opublikowany na WordPress",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/post"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts/published"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts/archived"] });
    },
    onError: () => {
      toast({
        title: "Błąd",
        description: "Nie udało się opublikować na WordPress",
        variant: "destructive",
      });
    },
  });

  const [tempBlogContent, setTempBlogContent] = useState("");
  const [tempBlogTitle, setTempBlogTitle] = useState("");
  const [tempFacebookContent, setTempFacebookContent] = useState("");
  const [tempInstagramContent, setTempInstagramContent] = useState("");

  // Update temp values when currentPost changes
  useEffect(() => {
    if (currentPost) {
      setTempBlogTitle(currentPost.blogTitle || "");
      setTempBlogContent(currentPost.blogContent || ""); // Load plain text from column C
      setTempFacebookContent(currentPost.facebookContent || "");
      setTempInstagramContent(currentPost.instagramContent || "");
    }
  }, [currentPost]);

  const handleContentChange = (column: string, content: string) => {
    if (currentPost) {
      updateCellMutation.mutate({ rowId: currentPost.rowId, column, content });
    }
  };

  const handleSaveChanges = () => {
    if (currentPost) {
      // Convert plain text to HTML
      const htmlContent = convertTextToHtml(tempBlogContent);

      // Save title
      updateCellMutation.mutate({
        rowId: currentPost.rowId,
        column: "blogTitle",
        content: tempBlogTitle
      });

      // Save plain text to column C
      updateCellMutation.mutate({
        rowId: currentPost.rowId,
        column: "blogContent",
        content: tempBlogContent
      });

      // Save HTML version to column D
      updateCellMutation.mutate({
        rowId: currentPost.rowId,
        column: "blogContentHtml",
        content: htmlContent
      });

      // Switch back to preview mode
      setIsBlogExpanded(false);

      // Refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/post"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts/archived"] });
    }
  };

  const handleSaveFacebook = () => {
    if (currentPost) {
      updateCellMutation.mutate({ 
        rowId: currentPost.rowId, 
        column: "facebookContent", 
        content: tempFacebookContent 
      });
      
      // Switch back to preview mode
      setIsFacebookExpanded(false);
      
      // Refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/post"] });
    }
  };

  const handleSaveInstagram = () => {
    if (currentPost) {
      updateCellMutation.mutate({ 
        rowId: currentPost.rowId, 
        column: "instagramContent", 
        content: tempInstagramContent 
      });
      
      // Switch back to preview mode
      setIsInstagramExpanded(false);
      
      // Refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/post"] });
    }
  };

  const handlePublishSocial = () => {
    if (currentPost) {
      publishSocialMutation.mutate(currentPost.rowId);
    }
  };

  const handlePublishWordPress = () => {
    if (currentPost) {
      publishWordPressMutation.mutate(currentPost.rowId);
    }
  };

  // Generic publish handler for archive section
  const handlePublish = (rowId: string, publishType: 'wordpress' | 'social-media') => {
    if (publishType === 'wordpress') {
      publishWordPressMutation.mutate(rowId);
    } else {
      publishSocialMutation.mutate(rowId);
    }
  };

  // Handle image upload
  const handleImageUpload = (rowId: string, oldImageUrl: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast({
        title: "Błąd",
        description: "Dozwolone formaty: JPG, PNG, WEBP",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "Błąd",
        description: "Maksymalny rozmiar pliku to 10MB",
        variant: "destructive",
      });
      return;
    }

    uploadImageMutation.mutate({ rowId, oldImageUrl, file });
  };

  const openModal = (post: Post) => {
    setSelectedPost(post);
    setIsModalOpen(true);
  };

  const getPublishStatus = (post: Post): string => {
    const isWpPublished = post.statusWP === 'Opublikowano';
    const isSmPublished = post.statusSM === 'Opublikowano';
    
    if (isWpPublished && isSmPublished) {
      return 'OPUBLIKOWANO';
    } else if (isWpPublished) {
      return 'OPUBLIKOWANO NA WORDPRESS';
    } else if (isSmPublished) {
      return 'OPUBLIKOWANO NA SOCIAL MEDIA';
    } else {
      return 'OPUBLIKOWANE';
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "Brak daty";
    try {
      // Handle DD-MM-YYYY format from Google Sheets (column A)
      if (dateString.includes('-') && dateString.split('-').length === 3) {
        const [day, month, year] = dateString.split('-');
        const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        return date.toLocaleDateString("pl-PL", {
          year: "numeric",
          month: "long", 
          day: "numeric",
        });
      }
      
      // Fallback for standard date formats
      const date = new Date(dateString);
      return date.toLocaleDateString("pl-PL", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return "Nieprawidłowa data";
    }
  };

  return (
    <div className="min-h-screen bg-rolbest-background text-rolbest-foreground">
      {/* Header */}
      <header className="bg-white border-b border-rolbest-border shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-rolbest-foreground">Panel Publikacji SMD-LED</h1>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-sm text-rolbest-muted-foreground flex items-center">
                <Circle className="w-3 h-3 text-green-500 mr-2 fill-current" />
                Połączono z Google Sheets
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setIsSettingsOpen(true)}
                data-testid="button-settings"
              >
                <Settings className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Loading indicator */}
        {(updateCellMutation.isPending || publishSocialMutation.isPending || publishWordPressMutation.isPending || uploadImageMutation.isPending) && (
          <div className="fixed top-4 right-4 bg-rolbest-primary text-white px-4 py-2 rounded-lg shadow-lg z-50">
            <div className="flex items-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              {uploadImageMutation.isPending ? 'Wysyłanie zdjęcia...' : 'Synchronizacja z Google Sheets...'}
            </div>
          </div>
        )}

        {/* Editing Section */}
        <div className="mb-12">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-rolbest-foreground mb-2">Edycja Treści</h2>
            <p className="text-rolbest-muted-foreground">Edytuj treść posta przed publikacją</p>
          </div>

          {isLoadingPost ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rolbest-primary mx-auto"></div>
              <p className="mt-2 text-rolbest-muted-foreground">Ładowanie danych posta...</p>
            </div>
          ) : !currentPost ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-rolbest-muted-foreground">
                  Brak postów na dzisiaj ze statusem "Do akceptacji"
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left Column - Content Editing */}
              <div className="lg:col-span-2 space-y-6">
                {/* Blog Editor/Preview */}
                <Card>
                  <CardContent className="pt-6">
                    <div 
                      className={`flex items-center justify-between mb-4 ${currentPost.statusWP === 'Opublikowano' ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                      onClick={() => currentPost.statusWP !== 'Opublikowano' && setIsBlogExpanded(!isBlogExpanded)}
                      data-testid="button-toggle-blog"
                    >
                      <div className="flex items-center">
                        <div className="w-2 h-2 bg-rolbest-primary rounded-full mr-3"></div>
                        <h3 className={`text-lg font-medium ${currentPost.statusWP === 'Opublikowano' ? 'text-rolbest-muted-foreground' : 'text-rolbest-foreground'}`}>
                          {currentPost.statusWP === 'Opublikowano' ? 'Blog Post (Opublikowany)' : (isBlogExpanded ? "Edycja Blog Post" : "Podgląd Blog Post")}
                        </h3>
                      </div>
                      {isBlogExpanded ? (
                        <ChevronUp className="w-5 h-5 text-rolbest-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-rolbest-muted-foreground" />
                      )}
                    </div>
                    
                    {isBlogExpanded ? (
                      // Edit Mode
                      <div className="space-y-4">
                        <div>
                          <label className="text-sm font-medium text-rolbest-foreground mb-2 block">
                            Tytuł Blog Post
                          </label>
                          <Input
                            placeholder="Wpisz tytuł blog posta..."
                            value={tempBlogTitle}
                            onChange={(e) => setTempBlogTitle(e.target.value)}
                            disabled={currentPost.statusWP === 'Opublikowano'}
                            data-testid="input-blog-title"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-rolbest-foreground mb-2 block">
                            Treść Blog Post
                          </label>
                          <Textarea
                            placeholder="Napisz treść blog posta..."
                            className="min-h-48 resize-none"
                            value={tempBlogContent}
                            onChange={(e) => setTempBlogContent(e.target.value)}
                            disabled={currentPost.statusWP === 'Opublikowano'}
                            data-testid="textarea-blog-content"
                          />
                          <div className="flex justify-between items-center mt-2 text-sm text-rolbest-muted-foreground">
                            <span>Zalecana długość: 300-800 słów</span>
                            <span data-testid="text-blog-char-count">
                              {tempBlogContent.length} znaków
                            </span>
                          </div>
                          <div className="flex justify-end mt-4">
                            <Button 
                              onClick={handleSaveChanges}
                              className="bg-rolbest-primary hover:bg-rolbest-primary/90"
                              disabled={currentPost.statusWP === 'Opublikowano'}
                              data-testid="button-save-blog"
                            >
                              <Save className="w-4 h-4 mr-2" />
                              {currentPost.statusWP === 'Opublikowano' ? 'Opublikowany' : 'Zapisz zmiany'}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      // Preview Mode
                      <div className="prose max-w-none">
                        <h4 className="text-xl font-semibold mb-3 text-rolbest-foreground" data-testid="text-blog-title">
                          {currentPost.blogTitle || "Tytuł Blog Posta"}
                        </h4>
                        <div 
                          className="text-rolbest-muted-foreground leading-relaxed prose max-w-none" 
                          data-testid="text-blog-content"
                          dangerouslySetInnerHTML={{
                            __html: currentPost.blogContentHtml || "Treść blog posta zostanie wyświetlona tutaj..."
                          }}
                        ></div>
                        {currentPost.statusWP !== 'Opublikowano' && (
                          <div className="mt-4 pt-3 border-t border-rolbest-border">
                            <span 
                              className="text-sm text-rolbest-muted-foreground flex items-center cursor-pointer hover:text-rolbest-primary transition-colors"
                              onClick={(e) => {
                                e.preventDefault();
                                setIsBlogExpanded(true);
                              }}
                              data-testid="button-edit-blog"
                            >
                              <Edit className="w-4 h-4 mr-2" />
                              Kliknij aby edytować
                            </span>
                          </div>
                        )}
                        {currentPost.statusWP === 'Opublikowano' && (
                          <div className="mt-4 pt-3 border-t border-rolbest-border">
                            <span className="text-sm text-rolbest-muted-foreground flex items-center">
                              <Edit className="w-4 h-4 mr-2" />
                              Post został opublikowany na WordPress
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Facebook Post Editor */}
                <Card>
                  <CardContent className="pt-6">
                    <div 
                      className={`flex items-center justify-between mb-4 ${currentPost.statusSM === 'Opublikowano' ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                      onClick={() => currentPost.statusSM !== 'Opublikowano' && setIsFacebookExpanded(!isFacebookExpanded)}
                      data-testid="button-toggle-facebook"
                    >
                      <div className="flex items-center">
                        <div className="w-2 h-2 bg-blue-600 rounded-full mr-3"></div>
                        <h3 className={`text-lg font-medium ${currentPost.statusSM === 'Opublikowano' ? 'text-rolbest-muted-foreground' : 'text-rolbest-foreground'}`}>
                          {currentPost.statusSM === 'Opublikowano' ? 'Facebook Post (Opublikowany)' : (isFacebookExpanded ? "Edycja Facebook Post" : "Podgląd Facebook Post")}
                        </h3>
                      </div>
                      {isFacebookExpanded ? (
                        <ChevronUp className="w-5 h-5 text-rolbest-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-rolbest-muted-foreground" />
                      )}
                    </div>
                    
                    {isFacebookExpanded ? (
                      // Edit Mode
                      <div className="space-y-4">
                        <Textarea
                          placeholder="Napisz treść posta na Facebook..."
                          className="min-h-32 resize-none"
                          value={tempFacebookContent}
                          onChange={(e) => setTempFacebookContent(e.target.value)}
                          disabled={currentPost.statusSM === 'Opublikowano'}
                          data-testid="textarea-facebook-content"
                        />
                        <div className="flex justify-between items-center text-sm text-rolbest-muted-foreground">
                          <span>Zalecana długość: 40-80 znaków</span>
                          <span data-testid="text-facebook-char-count">
                            {tempFacebookContent.length}/280
                          </span>
                        </div>
                        <div className="flex justify-end">
                          <Button 
                            onClick={handleSaveFacebook}
                            className="bg-rolbest-primary hover:bg-rolbest-primary/90"
                            disabled={currentPost.statusSM === 'Opublikowano'}
                            data-testid="button-save-facebook"
                          >
                            <Save className="w-4 h-4 mr-2" />
                            {currentPost.statusSM === 'Opublikowano' ? 'Opublikowany' : 'Zapisz zmiany'}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      // Preview Mode
                      <div>
                        <div 
                          className="text-rolbest-muted-foreground leading-relaxed min-h-[80px] p-3 border border-rolbest-border rounded-md bg-rolbest-muted/20" 
                          data-testid="text-facebook-content"
                        >
                          {currentPost.facebookContent || "Treść Facebook posta zostanie wyświetlona tutaj..."}
                        </div>
                        {currentPost.statusSM !== 'Opublikowano' && (
                          <div className="mt-4 pt-3 border-t border-rolbest-border">
                            <span 
                              className="text-sm text-rolbest-muted-foreground flex items-center cursor-pointer hover:text-rolbest-primary transition-colors"
                              onClick={(e) => {
                                e.preventDefault();
                                setIsFacebookExpanded(true);
                              }}
                              data-testid="button-edit-facebook"
                            >
                              <Edit className="w-4 h-4 mr-2" />
                              Kliknij aby edytować
                            </span>
                          </div>
                        )}
                        {currentPost.statusSM === 'Opublikowano' && (
                          <div className="mt-4 pt-3 border-t border-rolbest-border">
                            <span className="text-sm text-rolbest-muted-foreground flex items-center">
                              <Edit className="w-4 h-4 mr-2" />
                              Post został opublikowany na Social Media
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Instagram Post Editor */}
                <Card>
                  <CardContent className="pt-6">
                    <div 
                      className={`flex items-center justify-between mb-4 ${currentPost.statusSM === 'Opublikowano' ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                      onClick={() => currentPost.statusSM !== 'Opublikowano' && setIsInstagramExpanded(!isInstagramExpanded)}
                      data-testid="button-toggle-instagram"
                    >
                      <div className="flex items-center">
                        <div className="w-2 h-2 bg-pink-600 rounded-full mr-3"></div>
                        <h3 className={`text-lg font-medium ${currentPost.statusSM === 'Opublikowano' ? 'text-rolbest-muted-foreground' : 'text-rolbest-foreground'}`}>
                          {currentPost.statusSM === 'Opublikowano' ? 'Instagram Post (Opublikowany)' : (isInstagramExpanded ? "Edycja Instagram Post" : "Podgląd Instagram Post")}
                        </h3>
                      </div>
                      {isInstagramExpanded ? (
                        <ChevronUp className="w-5 h-5 text-rolbest-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-rolbest-muted-foreground" />
                      )}
                    </div>
                    
                    {isInstagramExpanded ? (
                      // Edit Mode
                      <div className="space-y-4">
                        <Textarea
                          placeholder="Napisz treść posta na Instagram..."
                          className="min-h-32 resize-none"
                          value={tempInstagramContent}
                          onChange={(e) => setTempInstagramContent(e.target.value)}
                          disabled={currentPost.statusSM === 'Opublikowano'}
                          data-testid="textarea-instagram-content"
                        />
                        <div className="flex justify-between items-center text-sm text-rolbest-muted-foreground">
                          <span>Używaj hashtagów dla lepszego zasięgu</span>
                          <span data-testid="text-instagram-char-count">
                            {tempInstagramContent.length}/2200
                          </span>
                        </div>
                        <div className="flex justify-end">
                          <Button 
                            onClick={handleSaveInstagram}
                            className="bg-rolbest-primary hover:bg-rolbest-primary/90"
                            disabled={currentPost.statusSM === 'Opublikowano'}
                            data-testid="button-save-instagram"
                          >
                            <Save className="w-4 h-4 mr-2" />
                            {currentPost.statusSM === 'Opublikowano' ? 'Opublikowany' : 'Zapisz zmiany'}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      // Preview Mode
                      <div>
                        <div 
                          className="text-rolbest-muted-foreground leading-relaxed min-h-[80px] p-3 border border-rolbest-border rounded-md bg-rolbest-muted/20" 
                          data-testid="text-instagram-content"
                        >
                          {currentPost.instagramContent || "Treść Instagram posta zostanie wyświetlona tutaj..."}
                        </div>
                        {currentPost.statusSM !== 'Opublikowano' && (
                          <div className="mt-4 pt-3 border-t border-rolbest-border">
                            <span 
                              className="text-sm text-rolbest-muted-foreground flex items-center cursor-pointer hover:text-rolbest-primary transition-colors"
                              onClick={(e) => {
                                e.preventDefault();
                                setIsInstagramExpanded(true);
                              }}
                              data-testid="button-edit-instagram"
                            >
                              <Edit className="w-4 h-4 mr-2" />
                              Kliknij aby edytować
                            </span>
                          </div>
                        )}
                        {currentPost.statusSM === 'Opublikowano' && (
                          <div className="mt-4 pt-3 border-t border-rolbest-border">
                            <span className="text-sm text-rolbest-muted-foreground flex items-center">
                              <Edit className="w-4 h-4 mr-2" />
                              Post został opublikowany na Social Media
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Right Column - Preview & Actions */}
              <div className="space-y-6">
                {/* Image Preview - All 3 Images */}
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center mb-4">
                      <div className="w-2 h-2 bg-rolbest-primary rounded-full mr-3"></div>
                      <h3 className="text-lg font-medium text-rolbest-foreground">Zdjęcia</h3>
                    </div>

                    {/* Image Grid - 3 images */}
                    <div className="space-y-4">
                      {/* Image 1 */}
                      <div>
                        <p className="text-sm text-rolbest-muted-foreground mb-2">Grafika 1</p>
                        <div className="aspect-video bg-rolbest-muted border-2 border-dashed border-rolbest-border rounded-lg flex items-center justify-center">
                          {currentPost.imageUrl ? (
                            <div className="w-full h-full relative">
                              <img
                                src={convertGoogleDriveLink(currentPost.imageUrl)}
                                alt="Grafika 1"
                                className="w-full h-full object-cover rounded-lg"
                                data-testid="img-post-preview-1"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  const fileIdMatch = currentPost.imageUrl?.match(/\/file\/d\/([a-zA-Z0-9-_]+)/);
                                  if (fileIdMatch && !target.src.includes('uc?id=')) {
                                    target.src = `https://drive.google.com/uc?id=${fileIdMatch[1]}`;
                                  }
                                }}
                              />
                              {currentPost.imageUrl.includes('drive.google.com') && (
                                <div className="absolute top-2 right-2">
                                  <Badge variant="secondary" className="text-xs">
                                    Google Drive
                                  </Badge>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="text-center text-rolbest-muted-foreground">
                              <Upload className="w-6 h-6 mx-auto mb-1" />
                              <span className="text-xs">Brak</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Image 2 */}
                      <div>
                        <p className="text-sm text-rolbest-muted-foreground mb-2">Grafika 2</p>
                        <div className="aspect-video bg-rolbest-muted border-2 border-dashed border-rolbest-border rounded-lg flex items-center justify-center">
                          {currentPost.imageUrl2 ? (
                            <div className="w-full h-full relative">
                              <img
                                src={convertGoogleDriveLink(currentPost.imageUrl2)}
                                alt="Grafika 2"
                                className="w-full h-full object-cover rounded-lg"
                                data-testid="img-post-preview-2"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  const fileIdMatch = currentPost.imageUrl2?.match(/\/file\/d\/([a-zA-Z0-9-_]+)/);
                                  if (fileIdMatch && !target.src.includes('uc?id=')) {
                                    target.src = `https://drive.google.com/uc?id=${fileIdMatch[1]}`;
                                  }
                                }}
                              />
                              {currentPost.imageUrl2.includes('drive.google.com') && (
                                <div className="absolute top-2 right-2">
                                  <Badge variant="secondary" className="text-xs">
                                    Google Drive
                                  </Badge>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="text-center text-rolbest-muted-foreground">
                              <Upload className="w-6 h-6 mx-auto mb-1" />
                              <span className="text-xs">Brak</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Image 3 */}
                      <div>
                        <p className="text-sm text-rolbest-muted-foreground mb-2">Grafika 3</p>
                        <div className="aspect-video bg-rolbest-muted border-2 border-dashed border-rolbest-border rounded-lg flex items-center justify-center">
                          {currentPost.imageUrl3 ? (
                            <div className="w-full h-full relative">
                              <img
                                src={convertGoogleDriveLink(currentPost.imageUrl3)}
                                alt="Grafika 3"
                                className="w-full h-full object-cover rounded-lg"
                                data-testid="img-post-preview-3"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  const fileIdMatch = currentPost.imageUrl3?.match(/\/file\/d\/([a-zA-Z0-9-_]+)/);
                                  if (fileIdMatch && !target.src.includes('uc?id=')) {
                                    target.src = `https://drive.google.com/uc?id=${fileIdMatch[1]}`;
                                  }
                                }}
                              />
                              {currentPost.imageUrl3.includes('drive.google.com') && (
                                <div className="absolute top-2 right-2">
                                  <Badge variant="secondary" className="text-xs">
                                    Google Drive
                                  </Badge>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="text-center text-rolbest-muted-foreground">
                              <Upload className="w-6 h-6 mx-auto mb-1" />
                              <span className="text-xs">Brak</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="relative mt-4">
                      <input
                        type="file"
                        id="current-post-image-upload"
                        accept="image/jpeg,image/jpg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => handleImageUpload(currentPost.rowId, currentPost.imageUrl || '', e)}
                        disabled={uploadImageMutation.isPending}
                      />
                      <Button
                        variant="outline"
                        className="w-full"
                        data-testid="button-change-image"
                        onClick={() => document.getElementById('current-post-image-upload')?.click()}
                        disabled={uploadImageMutation.isPending}
                      >
                        {uploadImageMutation.isPending ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />
                            Wysyłanie...
                          </>
                        ) : (
                          <>
                            <Upload className="w-4 h-4 mr-2" />
                            Zmień główne zdjęcie
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Publish Actions */}
                <Card>
                  <CardContent className="pt-6">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-3 bg-rolbest-muted rounded-lg">
                        <span className="text-sm text-rolbest-muted-foreground">WordPress:</span>
                        <Badge variant={currentPost.statusWP === 'Opublikowano' ? 'default' : 'secondary'} data-testid="badge-wordpress-status">
                          {currentPost.statusWP || 'Niepublikowane'}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between p-3 bg-rolbest-muted rounded-lg">
                        <span className="text-sm text-rolbest-muted-foreground">Social Media:</span>
                        <Badge variant={currentPost.statusSM === 'Opublikowano' ? 'default' : 'secondary'} data-testid="badge-social-status">
                          {currentPost.statusSM || 'Niepublikowane'}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between p-3 bg-rolbest-muted rounded-lg">
                        <span className="text-sm text-rolbest-muted-foreground">ID Wiersza:</span>
                        <span className="font-mono text-sm text-rolbest-foreground" data-testid="text-row-id">
                          {currentPost.rowId}
                        </span>
                      </div>

                      <Button
                        className={currentPost.statusSM === 'Opublikowano' ? "w-full bg-green-600 hover:bg-green-600/90 text-white" : "w-full bg-blue-600 hover:bg-blue-600/90 text-white"}
                        onClick={handlePublishSocial}
                        disabled={publishSocialMutation.isPending || currentPost.statusSM === 'Opublikowano'}
                        data-testid="button-publish-social"
                      >
                        {publishSocialMutation.isPending ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                            Publikowanie...
                          </>
                        ) : currentPost.statusSM === 'Opublikowano' ? (
                          <>
                            <Rocket className="w-4 h-4 mr-2" />
                            Opublikowano Posty na Social Media
                          </>
                        ) : (
                          <>
                            <Rocket className="w-4 h-4 mr-2" />
                            Opublikuj na Social Media
                          </>
                        )}
                      </Button>

                      <Button
                        className={currentPost.statusWP === 'Opublikowano' ? "w-full bg-green-600 hover:bg-green-600/90 text-white" : "w-full bg-orange-600 hover:bg-orange-600/90 text-white"}
                        onClick={handlePublishWordPress}
                        disabled={publishWordPressMutation.isPending || currentPost.statusWP === 'Opublikowano'}
                        data-testid="button-publish-wordpress"
                      >
                        {publishWordPressMutation.isPending ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                            Publikowanie...
                          </>
                        ) : currentPost.statusWP === 'Opublikowano' ? (
                          <>
                            <Rocket className="w-4 h-4 mr-2" />
                            Opublikowano Post na Bloga
                          </>
                        ) : (
                          <>
                            <Rocket className="w-4 h-4 mr-2" />
                            Opublikuj na WordPress
                          </>
                        )}
                      </Button>

                      <Button variant="secondary" className="w-full" data-testid="button-save-changes">
                        <Save className="w-4 h-4 mr-2" />
                        Zapisz Zmiany
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>

        {/* History Section */}
        <div>
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-xl font-semibold text-rolbest-foreground mb-2">Historia Publikacji</h2>
              <p className="text-rolbest-muted-foreground">Ostatnio opublikowane posty</p>
            </div>
            <Button variant="ghost" className="text-rolbest-primary hover:text-rolbest-primary/90" data-testid="link-show-all-history">
              Pokaż całą historię
              <ExternalLink className="w-4 h-4 ml-2" />
            </Button>
          </div>

          {isLoadingHistory ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rolbest-primary mx-auto"></div>
              <p className="mt-2 text-rolbest-muted-foreground">Ładowanie historii...</p>
            </div>
          ) : publishedPosts.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-rolbest-muted-foreground">
                  Brak opublikowanych postów do wyświetlenia.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {publishedPosts.slice(0, 5).map((post) => (
                <Card
                  key={post.rowId}
                  className="hover:shadow-lg transition-shadow cursor-pointer"
                  onClick={() => openModal(post)}
                  data-testid={`card-history-${post.rowId}`}
                >
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <Badge variant="default" className="bg-green-100 text-green-800">
                        {getPublishStatus(post)}
                      </Badge>
                      <span className="text-xs text-rolbest-muted-foreground">
                        {formatDate(post.publishedDate)}
                      </span>
                    </div>

                    {post.imageUrl && (
                      <img
                        src={convertGoogleDriveLink(post.imageUrl)}
                        alt="Post thumbnail"
                        className="w-full h-20 object-cover rounded mb-3"
                        data-testid={`img-history-thumbnail-${post.rowId}`}
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          const fileIdMatch = post.imageUrl?.match(/\/file\/d\/([a-zA-Z0-9-_]+)/);
                          if (fileIdMatch && !target.src.includes('uc?id=')) {
                            target.src = `https://drive.google.com/uc?id=${fileIdMatch[1]}`;
                          }
                        }}
                      />
                    )}

                    <h4 className="font-medium text-rolbest-foreground text-sm mb-2 line-clamp-2" data-testid={`text-history-title-${post.rowId}`}>
                      {post.blogTitle || "Bez tytułu"}
                    </h4>
                    
                    {/* Blog Content Preview */}
                    <div className="text-xs text-rolbest-muted-foreground line-clamp-2 mb-2" data-testid={`text-history-content-${post.rowId}`}>
                      {post.blogContentHtml ? (
                        <div dangerouslySetInnerHTML={{
                          __html: post.blogContentHtml.substring(0, 100) + (post.blogContentHtml.length > 100 ? '...' : '')
                        }} />
                      ) : (
                        "Brak treści blog posta..."
                      )}
                    </div>
                    
                    {/* Social Media Preview */}
                    {(post.facebookContent || post.instagramContent) && (
                      <div className="space-y-1">
                        {post.facebookContent && (
                          <div className="flex items-center text-xs text-blue-600">
                            <span className="w-2 h-2 bg-blue-600 rounded-full mr-2"></span>
                            <span className="line-clamp-1">{post.facebookContent.substring(0, 50)}...</span>
                          </div>
                        )}
                        {post.instagramContent && (
                          <div className="flex items-center text-xs text-pink-600">
                            <span className="w-2 h-2 bg-pink-600 rounded-full mr-2"></span>
                            <span className="line-clamp-1">{post.instagramContent.substring(0, 50)}...</span>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Archive Section */}
        <div>
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-xl font-semibold text-rolbest-foreground mb-2">📦 Archiwum</h2>
              <p className="text-rolbest-muted-foreground">Niepublikowane posty z przeszłości</p>
            </div>
          </div>

          {isLoadingArchive ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rolbest-primary mx-auto"></div>
              <p className="mt-2 text-rolbest-muted-foreground">Ładowanie archiwum...</p>
            </div>
          ) : archivedPosts.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-rolbest-muted-foreground">
                  Brak zarchiwizowanych postów do wyświetlenia.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Accordion type="single" collapsible className="w-full space-y-2">
              {archivedPosts.map((post) => (
                <AccordionItem key={post.rowId} value={post.rowId} className="border rounded-lg px-4">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex justify-between items-center w-full pr-4">
                      <div className="flex items-center gap-3">
                        <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                          Archiwum
                        </Badge>
                        <span className="font-medium text-left">{post.blogTitle || 'Bez tytułu'}</span>
                      </div>
                      <span className="text-sm text-rolbest-muted-foreground">
                        {formatDate(post.publishedDate)}
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="pt-4 space-y-4">
                      {/* Image Preview */}
                      <div className="space-y-2">
                        {post.imageUrl && (
                          <img
                            src={convertGoogleDriveLink(post.imageUrl)}
                            alt="Post"
                            className="w-full max-h-64 object-cover rounded-lg"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              const fileIdMatch = post.imageUrl?.match(/\/file\/d\/([a-zA-Z0-9-_]+)/);
                              if (fileIdMatch && !target.src.includes('uc?id=')) {
                                target.src = `https://drive.google.com/uc?id=${fileIdMatch[1]}`;
                              }
                            }}
                          />
                        )}

                        {/* Change Image Button */}
                        <div className="relative">
                          <input
                            type="file"
                            id={`archive-image-upload-${post.rowId}`}
                            accept="image/jpeg,image/jpg,image/png,image/webp"
                            className="hidden"
                            onChange={(e) => handleImageUpload(post.rowId, post.imageUrl || '', e)}
                            disabled={uploadImageMutation.isPending}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={() => document.getElementById(`archive-image-upload-${post.rowId}`)?.click()}
                            disabled={uploadImageMutation.isPending}
                          >
                            {uploadImageMutation.isPending ? (
                              <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />
                                Wysyłanie...
                              </>
                            ) : (
                              <>
                                <Upload className="w-4 h-4 mr-2" />
                                {post.imageUrl ? 'Zmień zdjęcie' : 'Dodaj zdjęcie'}
                              </>
                            )}
                          </Button>
                        </div>
                      </div>

                      {/* Content Tabs */}
                      <Tabs defaultValue="blog" className="w-full">
                        <TabsList className="grid w-full grid-cols-3">
                          <TabsTrigger value="blog">Blog</TabsTrigger>
                          <TabsTrigger value="facebook">Facebook</TabsTrigger>
                          <TabsTrigger value="instagram">Instagram</TabsTrigger>
                        </TabsList>

                        <TabsContent value="blog" className="space-y-2">
                          <Textarea
                            value={post.blogContent || ''}
                            readOnly
                            rows={8}
                            className="font-mono text-sm"
                          />
                        </TabsContent>

                        <TabsContent value="facebook" className="space-y-2">
                          <Textarea
                            value={post.facebookContent || ''}
                            readOnly
                            rows={6}
                          />
                        </TabsContent>

                        <TabsContent value="instagram" className="space-y-2">
                          <Textarea
                            value={post.instagramContent || ''}
                            readOnly
                            rows={6}
                          />
                        </TabsContent>
                      </Tabs>

                      {/* Publish Buttons */}
                      <Card className="bg-muted/50">
                        <CardContent className="pt-4">
                          <h4 className="font-semibold mb-3">Publikuj:</h4>
                          <div className="flex gap-3">
                            <Button
                              variant="default"
                              disabled={post.statusWP === 'Opublikowano'}
                              onClick={() => handlePublish(post.rowId, 'wordpress')}
                            >
                              {post.statusWP === 'Opublikowano' ? '✓ Opublikowano WP' : 'Opublikuj WordPress'}
                            </Button>
                            <Button
                              variant="secondary"
                              disabled={post.statusSM === 'Opublikowano'}
                              onClick={() => handlePublish(post.rowId, 'social-media')}
                            >
                              {post.statusSM === 'Opublikowano' ? '✓ Opublikowano SM' : 'Opublikuj Social Media'}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </div>
      </div>

      {/* History Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Szczegóły Publikacji"
      >
        {selectedPost && (
          <div className="space-y-6">
            <div className="flex items-center space-x-4">
              <Badge variant="default" className="bg-green-100 text-green-800">
                {getPublishStatus(selectedPost)}
              </Badge>
              <span className="text-sm text-rolbest-muted-foreground" data-testid="text-modal-date">
                {formatDate(selectedPost.publishedDate)}
              </span>
            </div>

            <div>
              <h4 className="font-medium text-rolbest-foreground mb-2">Tytuł Blog Post</h4>
              <p className="text-rolbest-foreground mb-4" data-testid="text-modal-blog-title">
                {selectedPost.blogTitle || "Bez tytułu"}
              </p>
            </div>
            
            <div>
              <h4 className="font-medium text-rolbest-foreground mb-2">Treść Blog Post</h4>
              <div className="text-rolbest-muted-foreground bg-rolbest-muted p-3 rounded-lg prose max-w-none" data-testid="text-modal-blog-content">
                {selectedPost.blogContentHtml ? (
                  <div dangerouslySetInnerHTML={{
                    __html: selectedPost.blogContentHtml
                  }} />
                ) : (
                  "Brak treści blog posta"
                )}
              </div>
            </div>

            <div>
              <h4 className="font-medium text-rolbest-foreground mb-2">Facebook Post</h4>
              <p className="text-rolbest-muted-foreground bg-rolbest-muted p-3 rounded-lg whitespace-pre-wrap" data-testid="text-modal-facebook-content">
                {selectedPost.facebookContent || "Brak treści"}
              </p>
            </div>

            <div>
              <h4 className="font-medium text-rolbest-foreground mb-2">Instagram Post</h4>
              <p className="text-rolbest-muted-foreground bg-rolbest-muted p-3 rounded-lg whitespace-pre-wrap" data-testid="text-modal-instagram-content">
                {selectedPost.instagramContent || "Brak treści"}
              </p>
            </div>

            {selectedPost.imageUrl && (
              <div>
                <h4 className="font-medium text-rolbest-foreground mb-2">Zdjęcie</h4>
                <div className="relative">
                  <img
                    src={convertGoogleDriveLink(selectedPost.imageUrl)}
                    alt="Post image"
                    className="w-full h-auto rounded-lg"
                    data-testid="img-modal-image"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      const fileIdMatch = selectedPost.imageUrl?.match(/\/file\/d\/([a-zA-Z0-9-_]+)/);
                      if (fileIdMatch && !target.src.includes('uc?id=')) {
                        target.src = `https://drive.google.com/uc?id=${fileIdMatch[1]}`;
                      }
                    }}
                  />
                  {selectedPost.imageUrl.includes('drive.google.com') && (
                    <div className="absolute top-2 right-2">
                      <Badge variant="secondary" className="text-xs">
                        Google Drive
                      </Badge>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Settings Modal */}
      <Modal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        title="Ustawienia Aplikacji"
      >
        <div className="space-y-6">
          <div>
            <h4 className="font-medium text-rolbest-foreground mb-4">Połączenie z Google Sheets</h4>
            <div className="bg-rolbest-muted p-4 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-rolbest-foreground">Status połączenia</p>
                  <p className="text-xs text-rolbest-muted-foreground">Automatyczne synchronizowanie z arkuszem</p>
                </div>
                <div className="flex items-center text-green-600">
                  <Circle className="w-3 h-3 mr-2 fill-current" />
                  <span className="text-sm">Połączono</span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-medium text-rolbest-foreground mb-4">Webhook Make.com</h4>
            <div className="bg-rolbest-muted p-4 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-rolbest-foreground">Publikacja automatyczna</p>
                  <p className="text-xs text-rolbest-muted-foreground">Uruchamianie po kliknięciu "Opublikuj"</p>
                </div>
                <div className="flex items-center text-green-600">
                  <Circle className="w-3 h-3 mr-2 fill-current" />
                  <span className="text-sm">Aktywny</span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-medium text-rolbest-foreground mb-4">Informacje o aplikacji</h4>
            <div className="bg-rolbest-muted p-4 rounded-lg space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-rolbest-muted-foreground">Wersja aplikacji:</span>
                <span className="text-sm text-rolbest-foreground">1.0.0</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-rolbest-muted-foreground">Ostatnia aktualizacja:</span>
                <span className="text-sm text-rolbest-foreground">Dzisiaj</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-rolbest-muted-foreground">Panel dla:</span>
                <span className="text-sm text-rolbest-foreground">SMD-LED</span>
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
