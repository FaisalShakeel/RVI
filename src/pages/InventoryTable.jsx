import React, { useState, useEffect } from "react";
import {
  Download,
  FileDown,
  Filter,
  Users,
  DollarSign,
  Search,
  X
} from "lucide-react";

const InventoryTable = () => {
  const [currentPage, setCurrentPage] = useState(1);
  const [feedId, setFeedId] = useState(10);
  const [inventory, setInventory] = useState([]);
  const [originalInventory, setOriginalInventory] = useState([]);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [currentImageUrls, setCurrentImageUrls] = useState([]);
  const [currentImageIds, setCurrentImageIds] = useState([]);

  const [filters, setFilters] = useState({
    stockNumber: "",
    manufacturer: "",
    condition: "",
    make: "",
    model: "",
    year: "",
    priceRange: "",
    productType: "",
    location: "",
  });

  const isPriceInRange = (price, range) => {
    if (!price || !range) return true;
    const numericPrice = parseFloat(price.replace(/[^0-9.-]+/g, ""));
    switch (range) {
      case "0-30000":
        return numericPrice < 30000;
      case "30000-50000":
        return numericPrice >= 30000 && numericPrice <= 50000;
      case "50000+":
        return numericPrice > 50000;
      default:
        return true;
    }
  };

  const handleFilterChange = (filterName, value) => {
    setFilters((prev) => ({
      ...prev,
      [filterName]: value,
    }));
    setCurrentPage(1);
  };

  const applyFilters = (data) => {
    return data.filter((item) => {
      return (
        (!filters.stockNumber ||
          item.stock_number
            ?.toLowerCase()
            .includes(filters.stockNumber.toLowerCase())) &&
        (!filters.manufacturer ||
          item.manufacturer
            ?.toLowerCase()
            .includes(filters.manufacturer.toLowerCase())) &&
        (!filters.condition || item.condition_type === filters.condition) &&
        (!filters.make ||
          item.make?.toLowerCase().includes(filters.make.toLowerCase())) &&
        (!filters.model ||
          item.model?.toLowerCase().includes(filters.model.toLowerCase())) &&
        (!filters.year || item.year?.toString() === filters.year) &&
        (!filters.productType || item.product_type === filters.productType) &&
        (!filters.location ||
          item.location
            ?.toLowerCase()
            .includes(filters.location.toLowerCase())) &&
        (!filters.priceRange ||
          isPriceInRange(item.sale_price, filters.priceRange))
      );
    });
  };

  // Function to calculate stats based on inventory
  const calculateStats = () => {
    const newUnits = inventory.filter((item) => item.condition_type === "New");
    const usedUnits = inventory.filter(
      (item) => item.condition_type === "Used"
    );

    const totalValue = inventory.reduce(
      (acc, item) =>
        acc + parseFloat(item.sale_price?.replace(/[^0-9.-]+/g, "") || 0),
      0
    );
    const newValue = newUnits.reduce(
      (acc, item) =>
        acc + parseFloat(item.sale_price?.replace(/[^0-9.-]+/g, "") || 0),
      0
    );
    const usedValue = usedUnits.reduce(
      (acc, item) =>
        acc + parseFloat(item.sale_price?.replace(/[^0-9.-]+/g, "") || 0),
      0
    );

    const avgPrice = totalValue / (inventory.length || 1);
    const newAvg = newValue / (newUnits.length || 1);
    const usedAvg = usedValue / (usedUnits.length || 1);

    return [
      {
        title: "Total Units",
        value: inventory.length.toLocaleString(),
        details: [
          { label: "New Units", value: newUnits.length.toLocaleString() },
          { label: "Used Units", value: usedUnits.length.toLocaleString() },
        ],
      },
      {
        title: "Total Value",
        value: `$${totalValue.toLocaleString()}`,
        details: [
          { label: "New Value", value: `$${newValue.toLocaleString()}` },
          { label: "Used Value", value: `$${usedValue.toLocaleString()}` },
        ],
      },
      {
        title: "Average Price",
        value: `$${avgPrice.toLocaleString()}`,
        details: [
          { label: "New Avg", value: `$${newAvg.toLocaleString()}` },
          { label: "Used Avg", value: `$${usedAvg.toLocaleString()}` },
        ],
      },
    ];
  };

  useEffect(() => {
    const fetchInventoryForFeed = async () => {
      try {
        const response = await fetch(
          `http://localhost:3001/api/inventory/${feedId}`
        );

        if (!response.ok) {
          throw new Error(`Error: ${response.statusText}`);
        }

        const data = await response.json();
        console.log(data)
        setOriginalInventory(data);
        setInventory(data);
      } catch (error) {
        console.error("Error fetching inventory:", error);
      }
    };

    fetchInventoryForFeed();
  }, [feedId]);

  useEffect(() => {
    const filteredData = applyFilters(originalInventory);
    setInventory(filteredData);
  }, [filters, originalInventory]);

  const stats = calculateStats();
  const rowsPerPage = 10;
  const indexOfLastRow = currentPage * rowsPerPage;
  const indexOfFirstRow = indexOfLastRow - rowsPerPage;
  const currentRows = inventory.slice(indexOfFirstRow, indexOfLastRow);
  const totalPages = Math.ceil(inventory.length / rowsPerPage);

  const handlePageChange = (pageNumber) => {
    setCurrentPage(pageNumber);
  };

  const handleExportCSV = async () => {
    try {
      const response = await fetch(`http://localhost:3001/api/inventory/${feedId}/export/csv`);
      if (!response.ok) throw new Error('Failed to export CSV');
  
      // Get filename from content-disposition header if available
      const contentDisposition = response.headers.get('content-disposition');
      let filename = 'inventory.csv';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename=(.+)/);
        if (filenameMatch) filename = filenameMatch[1];
      }
  
      // Download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error exporting CSV:', error);
        }
  }
  const handleExportPDF = async () => {
    try {
      const response = await fetch(`http://localhost:3001/api/inventory/${feedId}/export/pdf`);
      if (!response.ok) throw new Error('Failed to export PDF');
  
      // Get filename from content-disposition header if available
      const contentDisposition = response.headers.get('content-disposition');
      let filename = `inventory_${feedId}.pdf`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename=(.+)/);
        if (filenameMatch) filename = filenameMatch[1];
      }
  
      // Download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error exporting PDF:', error);
       }
  }
  
  const openImageModal = (inventoryId, assetUrls, assetIds) => {
    setCurrentImageUrls(assetUrls);
    setCurrentImageIds(assetIds);
    setImageModalOpen(true);
  };

  const handleCloseModal = () => {
    setImageModalOpen(false);
  };
  const ImageModal = () => {
    if (!imageModalOpen) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
        <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-auto relative">
          <button
            onClick={handleCloseModal}
            className="absolute top-4 right-4 z-60 text-gray-600 hover:text-gray-900"
          >
            <X className="h-6 w-6" />
          </button>
          <div className="p-6">
            <h2 className="text-xl font-semibold mb-4">Unit Images</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {currentImageUrls.map((url, index) => (
                <div
                  key={currentImageIds[index]}
                  className="border rounded-lg overflow-hidden shadow-sm"
                >
                  <img
                    src={url}
                    alt={`Unit Image ${index + 1}`}
                    className="w-full h-48 object-cover hover:scale-105 transition-transform"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };
  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((stat, index) => (
          <div key={index} className="bg-white rounded-lg p-6 shadow-sm">
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-sm font-medium text-gray-500">
                {stat.title}
              </h3>
              <div className="p-2">
                <DollarSign className="h-5 w-5 text-blue-500" />
              </div>
            </div>
            <div className="mt-2">
              <div className="text-2xl font-bold text-gray-900">
                {stat.value}
              </div>
              <div className="mt-2 space-y-1">
                {stat.details.map((detail, idx) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span className="text-gray-600">{detail.label}</span>
                    <span className="font-medium text-gray-900">
                      {detail.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Enhanced Filters Section */}
      <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <Filter className="w-5 h-5 mr-2 text-blue-500" />
            Filter Inventory
          </h2>
          <div className="flex gap-2">
          <button 
          onClick={handleExportCSV}
          className="px-4 py-2 bg-white text-blue-600 rounded-md hover:bg-blue-50 border border-blue-200 shadow-sm flex items-center"
        >
          <FileDown className="w-4 h-4 mr-2" />
          Export CSV
        </button>
        <button 
            onClick={handleExportPDF}
            className="px-4 py-2 bg-white text-blue-600 rounded-md hover:bg-blue-50 border border-blue-200 shadow-sm flex items-center"
          >
            <Download className="w-4 h-4 mr-2" />
            Export PDF
          </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search Stock Number"
              value={filters.stockNumber}
              onChange={(e) =>
                handleFilterChange("stockNumber", e.target.value)
              }
              className="pl-10 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>

          <select
            value={filters.condition}
            onChange={(e) => handleFilterChange("condition", e.target.value)}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="">Condition</option>
            <option value="New">New</option>
            <option value="Used">Used</option>
          </select>

          <select
            value={filters.make}
            onChange={(e) => handleFilterChange("make", e.target.value)}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="">Make</option>
            {[...new Set(originalInventory.map((item) => item.make))].map(
              (make) =>
                make && (
                  <option key={make} value={make}>
                    {make}
                  </option>
                )
            )}
          </select>

          <select
            value={filters.model}
            onChange={(e) => handleFilterChange("model", e.target.value)}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="">Model</option>
            {[...new Set(originalInventory.map((item) => item.model))].map(
              (model) =>
                model && (
                  <option key={model} value={model}>
                    {model}
                  </option>
                )
            )}
          </select>

          <select
            value={filters.year}
            onChange={(e) => handleFilterChange("year", e.target.value)}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="">Year</option>
            {[...new Set(originalInventory.map((item) => item.year))].map(
              (year) =>
                year && (
                  <option key={year} value={year}>
                    {year}
                  </option>
                )
            )}
          </select>

          <select
            value={filters.productType}
            onChange={(e) => handleFilterChange("productType", e.target.value)}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="">Product Type</option>
            {[
              ...new Set(originalInventory.map((item) => item.product_type)),
            ].map(
              (type) =>
                type && (
                  <option key={type} value={type}>
                    {type}
                  </option>
                )
            )}
          </select>

          <select
            value={filters.priceRange}
            onChange={(e) => handleFilterChange("priceRange", e.target.value)}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="">Price Range</option>
            <option value="0-30000">Under $30,000</option>
            <option value="30000-50000">$30,000 - $50,000</option>
            <option value="50000+">Over $50,000</option>
          </select>

          <select
            value={filters.location}
            onChange={(e) => handleFilterChange("location", e.target.value)}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="">Location</option>
            {[...new Set(originalInventory.map((item) => item.location))].map(
              (location) =>
                location && (
                  <option key={location} value={location}>
                    {location}
                  </option>
                )
            )}
          </select>
        </div>
      </div>

      {/* Inventory Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Stock #
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Description
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Manufacturer
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Condition
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Make/Model
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Year
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Type
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Price
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Location
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider text-center"
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {currentRows.map((item, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-blue-600">
                    {item.stock_number}
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-900">
                    {item.description}
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-500">
                    {item.manufacturer}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        item.condition_type === "New"
                          ? "bg-green-100 text-green-800"
                          : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {item.condition_type}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-500">
                    {item.make} {item.model}
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-500">
                    {item.year}
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-500">
                    {item.product_type}
                  </td>
                  <td className="px-4 py-4 text-sm">
                    <div className="flex flex-col">
                      <span className="text-xs text-gray-500 line-through">
                        {item.msrp}
                      </span>
                      <span className="font-medium text-green-600">
                        {item.sale_price}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-500">
                    {item.location}
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-500  space-x-4 flex items-center justify-start">
  <button
    onClick={() =>
      openImageModal(item.id, item.asset_urls, item.asset_ids)
    }
    className="text-green-600 hover:text-green-800 flex items-center bg-green-100 px-3 py-2 rounded-md transition-colors duration-300"
  >
    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
    View Images
  </button>

  <a
    href={`${item.item_detail_url}`}
    target="_blank"
    rel="noopener noreferrer"
    className="text-blue-600 hover:text-blue-800 hover:underline flex items-center"
  >
    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
    View Details
  </a>
</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-6 py-4">
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 disabled:bg-gray-200"
          >
            Previous
          </button>
          <div className="text-sm text-gray-700">
            Page {currentPage} of {totalPages}
          </div>
          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 disabled:bg-gray-200"
          >
            Next
          </button>
        </div>
      </div>
      <ImageModal />
    </div>

  );
};

export default InventoryTable;
