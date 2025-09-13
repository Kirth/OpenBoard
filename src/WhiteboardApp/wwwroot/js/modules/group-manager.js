// group-manager.js - Manages element grouping functionality
class GroupManager {
    constructor() {
        this.groups = new Map(); // groupId -> { id, elementIds, bounds, metadata }
        this.elementGroups = new Map(); // elementId -> groupId
        this.dependencies = {};
        this.isSelectingGroup = false; // Flag to prevent infinite recursion
    }

    setDependencies(deps) {
        this.dependencies = deps;
    }

    // Group Creation and Management
    createGroupFromSelection() {
        const selectedElements = this.dependencies.elementFactory?.getSelectedElements() || [];
        if (selectedElements.length < 2) {
            console.warn('Cannot group: Need at least 2 elements selected');
            return null;
        }

        const elementIds = selectedElements.map(el => el.id);
        return this.createGroup(elementIds);
    }

    createGroup(elementIds) {
        if (!elementIds || elementIds.length < 2) {
            console.warn('Cannot create group: Need at least 2 elements');
            return null;
        }

        const tempGroupId = this.generateTempGroupId();
        
        // Store temporary group data
        this.groups.set(tempGroupId, {
            id: tempGroupId,
            elementIds: [...elementIds],
            bounds: this.calculateGroupBounds(elementIds),
            metadata: {
                createdAt: Date.now(),
                isTemporary: true
            }
        });

        // Update element-to-group mapping
        elementIds.forEach(elementId => {
            this.elementGroups.set(elementId, tempGroupId);
        });

        // Send create group request to server
        if (this.dependencies.signalRClient) {
            this.dependencies.signalRClient.sendCreateGroup(elementIds);
        }

        // Update visual state
        this.updateGroupVisuals(tempGroupId);
        
        return tempGroupId;
    }

    ungroupSelected() {
        const selectedElements = this.dependencies.elementFactory?.getSelectedElements() || [];
        const groupsToUngroup = new Set();

        selectedElements.forEach(element => {
            const groupId = this.getElementGroupId(element.id);
            if (groupId) {
                groupsToUngroup.add(groupId);
            }
        });

        groupsToUngroup.forEach(groupId => {
            this.ungroupElements(groupId);
        });
    }

    ungroupElements(groupId) {
        const group = this.groups.get(groupId);
        if (!group) {
            console.warn(`Group ${groupId} not found`);
            return false;
        }

        // Send ungroup request to server
        if (this.dependencies.signalRClient) {
            this.dependencies.signalRClient.sendUngroupElements(groupId);
        }

        // Update local state immediately for responsiveness
        this.removeGroupLocally(groupId);
        
        return true;
    }

    // Group State Management
    getGroupElements(groupId) {
        const group = this.groups.get(groupId);
        if (!group) return [];

        return group.elementIds
            .map(elementId => this.dependencies.elementFactory?.getElementById(elementId))
            .filter(element => element !== null);
    }

    isElementInGroup(elementId) {
        return this.elementGroups.has(elementId);
    }

    getElementGroupId(elementId) {
        return this.elementGroups.get(elementId) || null;
    }

    getGroupById(groupId) {
        return this.groups.get(groupId) || null;
    }

    getAllGroups() {
        return Array.from(this.groups.values());
    }

    // Group Operations
    moveGroup(groupId, deltaX, deltaY) {
        const group = this.groups.get(groupId);
        if (!group) return false;

        // Update group bounds
        if (group.bounds) {
            group.bounds.x += deltaX;
            group.bounds.y += deltaY;
        }

        // Send move request to server
        if (this.dependencies.signalRClient) {
            this.dependencies.signalRClient.sendMoveGroup(groupId, deltaX, deltaY);
        }

        return true;
    }

    deleteGroup(groupId) {
        const group = this.groups.get(groupId);
        if (!group) return false;

        // Send delete request to server
        if (this.dependencies.signalRClient) {
            this.dependencies.signalRClient.sendDeleteGroup(groupId);
        }

        return true;
    }

    selectGroup(groupId) {
        const groupElements = this.getGroupElements(groupId);
        if (groupElements.length === 0) return false;

        // Prevent infinite recursion by setting a flag
        this.isSelectingGroup = true;
        
        try {
            // Select all elements in the group
            if (this.dependencies.elementFactory) {
                this.dependencies.elementFactory.clearSelection();
                groupElements.forEach(element => {
                    this.dependencies.elementFactory.selectElement(element.id, true);
                });
            }
        } finally {
            this.isSelectingGroup = false;
        }

        return true;
    }

    // Group-aware selection logic
    handleElementSelection(elementId, addToSelection = false, ctrlKey = false) {
        // Prevent infinite recursion
        if (this.isSelectingGroup) {
            return true;
        }
        
        const groupId = this.getElementGroupId(elementId);
        
        if (groupId && !ctrlKey) {
            // Select entire group when clicking on grouped element (unless Ctrl is held)
            return this.selectGroup(groupId);
        } else {
            // Normal element selection
            if (this.dependencies.elementFactory) {
                this.dependencies.elementFactory.selectElement(elementId, addToSelection);
            }
            return true;
        }
    }

    // Visual Management
    updateGroupBounds(groupId) {
        const groupElements = this.getGroupElements(groupId);
        if (groupElements.length === 0) return null;

        const bounds = this.calculateGroupBounds(groupElements.map(el => el.id));
        const group = this.groups.get(groupId);
        if (group) {
            group.bounds = bounds;
        }

        return bounds;
    }

    calculateGroupBounds(elementIds) {
        const elements = elementIds
            .map(id => this.dependencies.elementFactory?.getElementById(id))
            .filter(element => element !== null);

        if (elements.length === 0) return null;

        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        elements.forEach(element => {
            const elementBounds = this.getElementBounds(element);
            minX = Math.min(minX, elementBounds.x);
            minY = Math.min(minY, elementBounds.y);
            maxX = Math.max(maxX, elementBounds.x + elementBounds.width);
            maxY = Math.max(maxY, elementBounds.y + elementBounds.height);
        });

        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };
    }

    getElementBounds(element) {
        return {
            x: element.x,
            y: element.y,
            width: element.width || 0,
            height: element.height || 0
        };
    }

    drawGroupBounds(group, context) {
        if (!group.bounds || !context) return;

        // Convert world coordinates to screen coordinates
        const screenCoords = this.dependencies.canvasManager?.worldToScreen(
            group.bounds.x, 
            group.bounds.y
        );
        
        if (!screenCoords) return;

        const scale = this.dependencies.viewportManager?.z || 1;
        const screenWidth = group.bounds.width * scale;
        const screenHeight = group.bounds.height * scale;

        // Draw subtle group outline
        context.save();
        context.strokeStyle = '#4A90E2';
        context.lineWidth = 2;
        context.setLineDash([8, 4]);
        context.globalAlpha = 0.6;
        
        context.strokeRect(
            screenCoords.x - 4, 
            screenCoords.y - 4, 
            screenWidth + 8, 
            screenHeight + 8
        );

        // Draw group badge
        this.drawGroupBadge(context, screenCoords.x - 4, screenCoords.y - 4);
        
        context.restore();
    }

    drawGroupBadge(context, x, y) {
        const badgeSize = 16;
        
        // Badge background
        context.fillStyle = '#4A90E2';
        context.fillRect(x - badgeSize/2, y - badgeSize/2, badgeSize, badgeSize);
        
        // Badge text
        context.fillStyle = 'white';
        context.font = '10px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText('G', x, y);
    }

    updateGroupVisuals(groupId) {
        if (this.dependencies.canvasManager) {
            this.dependencies.canvasManager.redrawCanvas();
        }
    }

    // Server Event Handlers
    onGroupCreated(data) {
        const { groupId, elementIds } = data;
        
        // Replace temporary group with server group
        const tempGroupId = this.findTempGroupForElements(elementIds);
        if (tempGroupId) {
            this.removeGroupLocally(tempGroupId);
        }

        // Create permanent group
        this.groups.set(groupId, {
            id: groupId,
            elementIds: [...elementIds],
            bounds: this.calculateGroupBounds(elementIds),
            metadata: {
                createdAt: Date.now(),
                isTemporary: false
            }
        });

        // Update element-to-group mapping
        elementIds.forEach(elementId => {
            this.elementGroups.set(elementId, groupId);
        });

        this.updateGroupVisuals(groupId);
        console.log(`Group ${groupId} created with ${elementIds.length} elements`);
    }

    onGroupUngrouped(data) {
        const { groupId, elementIds } = data;
        this.removeGroupLocally(groupId);
        this.updateGroupVisuals(groupId);
        console.log(`Group ${groupId} ungrouped`);
    }

    onGroupMoved(data) {
        const { groupId, deltaX, deltaY } = data;
        const group = this.groups.get(groupId);
        
        if (group && group.bounds) {
            group.bounds.x += deltaX;
            group.bounds.y += deltaY;
            this.updateGroupVisuals(groupId);
        }
    }

    onGroupDeleted(data) {
        const { groupId } = data;
        this.removeGroupLocally(groupId);
        this.updateGroupVisuals(groupId);
        console.log(`Group ${groupId} deleted`);
    }

    onGroupZIndexChanged(data) {
        const { groupId, newBaseZIndex } = data;
        // Group z-index changes are handled by individual element updates
        console.log(`Group ${groupId} z-index changed to ${newBaseZIndex}`);
    }

    // Helper Methods
    generateTempGroupId() {
        return `temp_group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    findTempGroupForElements(elementIds) {
        for (const [groupId, group] of this.groups) {
            if (group.metadata?.isTemporary && 
                this.arraysEqual(group.elementIds.sort(), elementIds.sort())) {
                return groupId;
            }
        }
        return null;
    }

    removeGroupLocally(groupId) {
        const group = this.groups.get(groupId);
        if (group) {
            // Remove element-to-group mappings
            group.elementIds.forEach(elementId => {
                this.elementGroups.delete(elementId);
            });
            
            // Remove group
            this.groups.delete(groupId);
        }
    }

    arraysEqual(a, b) {
        return a.length === b.length && a.every(val => b.includes(val));
    }

    // Context menu integration
    getContextMenuItems(selectedElements) {
        const items = [];
        
        if (selectedElements.length >= 2) {
            // Multiple elements selected - show group option
            const allUngrouped = selectedElements.every(el => !this.isElementInGroup(el.id));
            if (allUngrouped) {
                items.push({
                    label: 'Group Selected',
                    action: () => this.createGroupFromSelection()
                });
            }
        }

        if (selectedElements.length >= 1) {
            // Check if any selected elements are in groups
            const groupedElements = selectedElements.filter(el => this.isElementInGroup(el.id));
            if (groupedElements.length > 0) {
                items.push({
                    label: 'Ungroup',
                    action: () => this.ungroupSelected()
                });
            }

            // If single element is part of a group, offer to select entire group
            if (selectedElements.length === 1 && this.isElementInGroup(selectedElements[0].id)) {
                const groupId = this.getElementGroupId(selectedElements[0].id);
                items.push({
                    label: 'Select Group',
                    action: () => this.selectGroup(groupId)
                });
            }
        }

        return items;
    }

    // Cleanup
    destroy() {
        this.groups.clear();
        this.elementGroups.clear();
        this.dependencies = {};
    }
}

// Create singleton instance
const groupManager = new GroupManager();

export default groupManager;