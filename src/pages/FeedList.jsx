import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Trash2, AlertCircle, RefreshCw, Clock } from "lucide-react";

const FeedList = () => {
  const [feedUrl, setFeedUrl] = useState("");
  const [feeds, setFeeds] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [autoUpdateSettings, setAutoUpdateSettings] = useState({});

  useEffect(() => {
    fetchFeeds();
    const interval = setInterval(fetchFeeds, 5000);
    return () => clearInterval(interval);
  }, []);

 
  const fetchFeeds = async () => {
    try {
      const response = await fetch("http://localhost:3001/api/feeds/fetch");
      if (!response.ok) throw new Error("Failed to fetch feeds");
      const data = await response.json();
      setFeeds(data);

      const newAutoUpdateSettings = data.reduce(
        (acc, feed) => {
          if (!(feed.id in acc)) {
            acc[feed.id] = feed.auto_update || false;
          }
          return acc;
        },
        { ...autoUpdateSettings }
      );

      setAutoUpdateSettings((prev) => ({ ...prev, ...newAutoUpdateSettings }));
    } catch (error) {
      console.error("Error fetching feeds:", error);
      setError("Failed to load feeds");
    }
  };

  const handleAddFeed = async (e) => {
    e.preventDefault();
    if (!feedUrl.trim()) {
      setError("Please enter a valid URL");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("http://localhost:3001/api/feeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: feedUrl }),
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Failed to add feed");

      setFeedUrl("");
      fetchFeeds();
    } catch (error) {
      console.error("Error:", error);
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetry = async (feedId) => {
    try {
      await fetch(`http://localhost:3001/api/feeds/${feedId}/retry`, {
        method: "POST",
      });
      fetchFeeds();
    } catch (error) {
      setError("Failed to retry feed");
    }
  };

  const handleDelete = async (feedId) => {
    try {
      await fetch(`http://localhost:3001/api/feeds/${feedId}`, {
        method: "DELETE",
      });
      fetchFeeds();
    } catch (error) {
      setError("Failed to delete feed");
    }
  };

  const handleManualUpdate = async (feedId) => {
    try {
      setError("");
      await fetch(`http://localhost:3001/api/feeds/${feedId}/update`, {
        method: "POST",
      });
      fetchFeeds();
    } catch (error) {
      setError("Failed to update feed");
    }
  };

  const toggleAutoUpdate = async (feedId) => {
    try {
      const currentFeed = feeds.find((feed) => feed.id === feedId);
      const currentEnabled = currentFeed.auto_update === 1;

      const response = await fetch(
        `http://localhost:3001/api/feeds/${feedId}/auto-update`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            enabled: !currentEnabled,
          }),
        }
      );

      if (!response.ok)
        throw new Error("Failed to update auto-update settings");

      
      setFeeds((prevFeeds) =>
        prevFeeds.map((feed) =>
          feed.id === feedId
            ? { ...feed, auto_update: currentEnabled ? 0 : 1 }
            : feed
        )
      );
    } catch (error) {
      setError("Failed to update auto-update settings");
    }
  };

  return (
    <div className="space-y-6 relative">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h2 className="text-xl font-semibold text-gray-900">
            Inventory Feed URL
          </h2>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <AlertCircle className="h-5 w-5 text-red-400" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">{error}</h3>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleAddFeed} className="mt-4">
        <div className="flex gap-4">
          <input
            type="text"
            value={feedUrl}
            onChange={(e) => setFeedUrl(e.target.value)}
            placeholder="Enter URL"
            disabled={isLoading}
            className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6 px-3"
          />
          <button
            type="submit"
            disabled={isLoading}
            className={`rounded-md px-4 py-2 text-sm font-semibold text-white shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
              isLoading
                ? "bg-blue-400 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-500"
            }`}
          >
            {isLoading ? "Processing..." : "Feed"}
          </button>
        </div>
      </form>

      <div className="mt-8 flow-root">
        <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
            <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
              <div className="min-w-full divide-y divide-gray-300">
                {feeds.length === 0 ? (
                  <div className="p-4 text-center text-gray-500">
                    No feeds added yet
                  </div>
                ) : (
                  feeds.map((feed) => (
                    <div
                      key={feed.id}
                      className="bg-white px-4 py-5 sm:px-6 flex items-center justify-between hover:bg-gray-50 relative"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {feed.url}
                        </p>
                        <p className="text-sm text-gray-500">
                          Added {new Date(feed.created_at).toLocaleString()}
                        </p>
                        {feed.status === "failed" && feed.error_message && (
                          <p className="text-sm text-red-600 mt-1">
                            Error: {feed.error_message}
                          </p>
                        )}
                        {feed.status === "ready" && (
                          <p className="text-sm text-gray-500 mt-1">
                            Auto Update:{" "}
                            {feed.auto_update === 1 ? "Enabled" : "Disabled"}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-1 text-sm font-medium ${
                            feed.status === "ready"
                              ? "bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/20"
                              : feed.status === "processing"
                              ? "bg-yellow-50 text-yellow-700 ring-1 ring-inset ring-yellow-600/20"
                              : "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20"
                          }`}
                        >
                          {feed.status}
                        </span>

                        {feed.status === "ready" && (
                          <>
                            <button
                              onClick={() => handleManualUpdate(feed.id)}
                              title="Manual Update"
                              className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-sm font-semibold text-blue-700 shadow-sm hover:bg-blue-100"
                            >
                              <RefreshCw className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => toggleAutoUpdate(feed.id)}
                              title={
                                feed.auto_update === 1
                                  ? "Disable Auto-Update"
                                  : "Enable Auto-Update"
                              }
                              className={`inline-flex items-center rounded-md px-2 py-1 text-sm font-semibold shadow-sm ${
                                feed.auto_update === 1
                                  ? "bg-green-500 text-white hover:bg-green-600"
                                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                              }`}
                            >
                              <Clock className="h-4 w-4" />
                            </button>
                            <Link
                              to={`/inventory/${feed.id}`}
                              className="inline-flex items-center rounded-md bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700 shadow-sm hover:bg-blue-100"
                            >
                              View
                            </Link>
                          </>
                        )}

                        {(feed.status === "failed" ||
                          feed.status === "processing") && (
                          <>
                            {feed.status === "failed" && (
                              <button
                                onClick={() => handleRetry(feed.id)}
                                className="inline-flex items-center rounded-md bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700 shadow-sm hover:bg-blue-100"
                              >
                                Retry
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(feed.id)}
                              className="inline-flex items-center rounded-md bg-red-50 px-2 py-1 text-sm font-semibold text-red-700 shadow-sm hover:bg-red-100"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FeedList;
