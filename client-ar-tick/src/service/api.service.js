import axios from 'axios';

const api = axios.create({
    baseURL: 'http:',
    withCredentials: true, 
})

api.get('')