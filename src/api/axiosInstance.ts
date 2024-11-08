import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { jwtVerify, SignJWT } from 'jose';
import CryptoJS from 'crypto-js';
import { products } from '../data/products';
import { Product, Comment } from '../types/Product';
import { JWT_SECRET, API_BASE_URL } from '../config';

/*
I have added this mock backend so the application can simulate having
a backend while being standalone.
*/

// Create a custom Axios instance
const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
});

// Initialize mock adapter for this instance, adding 200ms delay for realism
const mock = new MockAdapter(axiosInstance, { delayResponse: 200 });

// Function to get product data from sessionStorage or initialize it
const getProductData = () => {
  const data = sessionStorage.getItem('productData');
  return data ? JSON.parse(data) : products;
};

// Function to save product data to sessionStorage
const saveProductData = (data: Product[]) => {
  sessionStorage.setItem('productData', JSON.stringify(data));
};

// Predefined user with hashed password
const users = [
  {
    username: 'user',
    passwordHash: CryptoJS.SHA256('user123').toString(),
  },
];

// Mock POST /api/login
mock.onPost('/login').reply(async (config) => {
  const { username, password } = JSON.parse(config.data);

  const user = users.find((u) => u.username === username);
  if (user && CryptoJS.SHA256(password).toString() === user.passwordHash) {
    const token = await new SignJWT({ username })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(JWT_SECRET));

    return [200, { token }];
  } else {
    return [401, { message: 'Invalid username or password' }];
  }
});

// Mock GET /api/products
mock.onGet('/products').reply(async (config) => {
  const authHeader = config.headers?.Authorization || config.headers?.authorization;
  if (!authHeader) {
    return [401, { message: 'Unauthorized' }];
  }

  const token = authHeader.split(' ')[1];
  try {
    await jwtVerify(token, new TextEncoder().encode(JWT_SECRET));
    const productData = getProductData();
    return [200, productData];
  } catch (error) {
    return [401, { message: 'Invalid token' }];
  }
});

// Mock GET /api/products/:id
mock.onGet(/\/products\/\d+$/).reply(async (config) => {
  const authHeader = config.headers?.Authorization || config.headers?.authorization;
  if (!authHeader) {
    return [401, { message: 'Unauthorized' }];
  }

  const token = authHeader.split(' ')[1];
  try {
    await jwtVerify(token, new TextEncoder().encode(JWT_SECRET));
    const productData = getProductData();
    const id = parseInt(config.url!.split('/').pop()!, 10);
    const product = productData.find((p: Product) => p.id === id);
    if (product) {
      return [200, product];
    } else {
      return [404, { message: 'Product not found' }];
    }
  } catch (error) {
    return [401, { message: 'Invalid token' }];
  }
});

// Mock POST /api/products/:id/comments
mock.onPost(/\/products\/\d+\/comments/).reply(async (config) => {
  const authHeader = config.headers?.Authorization || config.headers?.authorization;
  if (!authHeader) {
    return [401, { message: 'Unauthorized' }];
  }

  const token = authHeader.split(' ')[1];
  try {
    await jwtVerify(token, new TextEncoder().encode(JWT_SECRET));
    const productData = getProductData();
    const id = parseInt(config.url!.split('/')[2], 10);
    const product = productData.find((p: Product) => p.id === id);
    if (product) {
      const newComment: Comment = JSON.parse(config.data);
      product.comments.unshift(newComment);
      // Update the product's average rating
      product.rating =
        product.comments.reduce((sum: number, c: Comment) => sum + c.rating, 0) /
        product.comments.length;
      saveProductData(productData);
      return [201, newComment];
    } else {
      return [404, { message: 'Product not found' }];
    }
  } catch (error) {
    return [401, { message: 'Invalid token' }];
  }
});

// Request interceptor for adding Authorization header
axiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for handling 401 errors
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response &&
      error.response.status === 401 &&
      !error.config._retry
    ) {
      error.config._retry = true;
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default axiosInstance;