const defaultPermissions = [
    { module: 'dashboard', canView: true, canCreate: false, canEdit: false, canDelete: false },
    { module: 'leads', canView: true, canCreate: true, canEdit: true, canDelete: false },
    { module: 'students', canView: true, canCreate: true, canEdit: true, canDelete: false },
    { module: 'courses', canView: true, canCreate: false, canEdit: false, canDelete: false },
    { module: 'enrollments', canView: true, canCreate: true, canEdit: true, canDelete: false },
    { module: 'payments', canView: true, canCreate: true, canEdit: false, canDelete: false },
    { module: 'attendance', canView: true, canCreate: true, canEdit: true, canDelete: false },
    { module: 'content', canView: true, canCreate: false, canEdit: false, canDelete: false },
    { module: 'users', canView: false, canCreate: false, canEdit: false, canDelete: false },
    { module: 'reports', canView: true, canCreate: false, canEdit: false, canDelete: false }
];

const getPermissionsByRole = (role) => {
    if (role === 'admin') {
        return defaultPermissions.map(p => ({
            ...p,
            canView: true,
            canCreate: true,
            canEdit: true,
            canDelete: true
        }));
    }
    
    if (role === 'trainer') {
        return defaultPermissions.map(p => {
            if (p.module === 'students' || p.module === 'attendance' || p.module === 'content' || p.module === 'courses') {
                return { ...p, canView: true, canCreate: true, canEdit: true, canDelete: false };
            }
            return p;
        });
    }
    
    if (role === 'counselor') {
        return defaultPermissions.map(p => {
            if (p.module === 'leads' || p.module === 'students' || p.module === 'enrollments') {
                return { ...p, canView: true, canCreate: true, canEdit: true, canDelete: false };
            }
            return p;
        });
    }
    
    if (role === 'student') {
        return defaultPermissions
            .filter(p => p.module === 'dashboard' || p.module === 'courses' || p.module === 'content')
            .map(p => ({ ...p, canCreate: false, canEdit: false, canDelete: false }));
    }
    
    return defaultPermissions;
};

module.exports = {
    defaultPermissions,
    getPermissionsByRole
};