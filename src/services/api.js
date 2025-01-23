const API_BASE_URL = 'http://localhost:3001/api';

export const fetchInventory = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/inventory`);
    if (!response.ok) throw new Error('Failed to fetch inventory');
    return await response.json();
  } catch (error) {
    console.error('Error fetching inventory:', error);
    throw error;
  }
};

export const updateInventory = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/fetch-inventory`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to update inventory');
    return await response.json();
  } catch (error) {
    console.error('Error updating inventory:', error);
    throw error;
  }
};