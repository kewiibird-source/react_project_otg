export const fetchWithAuth = async (url, options = {}) => {
  let accessToken = localStorage.getItem('accessToken');
  if (!options.headers) options.headers = {};
  if (accessToken) options.headers['Authorization'] = `Bearer ${accessToken}`;
  let response = await fetch(url, options);

  if (response.status === 401 || response.status === 403) {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
      alert("로그인이 만료되었습니다. 다시 로그인해주세요.");
      localStorage.clear(); window.location.href = '/login'; return response;
    }
    try {
      const refreshRes = await fetch("http://localhost:3010/user/refresh", { 
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken }) 
      });
      const refreshData = await refreshRes.json();
      if (refreshData.result && refreshData.accessToken) {
        localStorage.setItem('accessToken', refreshData.accessToken);
        options.headers['Authorization'] = `Bearer ${refreshData.accessToken}`;
        response = await fetch(url, options);
      } else throw new Error("리프레시 토큰도 만료됨");
    } catch (error) {
      alert("세션이 만료되었습니다. 다시 로그인해주세요.");
      localStorage.clear(); window.location.href = '/login';
    }
  }
  return response;
};